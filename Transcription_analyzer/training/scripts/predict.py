#!/usr/bin/env python3
"""Run deterministic split predictions with a Qwen3 base model or adapter."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "analyzer"))
from analyzer.scoring import ScoreError, parse_score  # noqa: E402


def parse_prediction(raw: str) -> tuple[dict | None, str | None]:
    try:
        return parse_score(raw).model_dump(), None
    except ScoreError as exc:
        values = {}
        for dimension in ("responsiveness", "engagement", "fluency", "coherence"):
            match = re.search(
                rf'^\s*"{dimension}"\s*:\s*(\d+(?:\.\d+)?)\s*[,}}]',
                raw, re.MULTILINE)
            if match:
                values[dimension] = int(float(match.group(1)))
        if len(values) != 4:
            return None, str(exc)
        drift = re.search(r'^\s*"drift_flag"\s*:\s*(true|false)',
                          raw, re.MULTILINE | re.IGNORECASE)
        normalized = {
            dimension: {
                "score": values[dimension],
                "confidence": 0.0,
                "evidence": [],
            }
            for dimension in ("responsiveness", "engagement", "fluency",
                              "coherence")
        }
        normalized.update({
            "drift_flag": bool(drift and drift.group(1).lower() == "true"),
            "notes": "",
        })
        try:
            scores = parse_score(json.dumps(normalized)).model_dump()
        except ScoreError:
            return None, str(exc)
        return scores, f"{exc}; recovered flat numeric fields"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--split", choices=("test", "val"), required=True)
    parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
    parser.add_argument("--tokenizer", type=Path,
                        default=_ROOT / "models/qwen3-8b-lora-run1")
    parser.add_argument("--adapter", default="none",
                        help="adapter directory, or 'none' for base baseline")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-new-tokens", type=int, default=400)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    import torch
    from peft import PeftModel
    from transformers import (AutoModelForCausalLM, AutoTokenizer,
                              BitsAndBytesConfig)

    tok = AutoTokenizer.from_pretrained(args.tokenizer, local_files_only=True)
    template_path = args.tokenizer / "chat_template.jinja"
    if not tok.chat_template and template_path.is_file():
        tok.chat_template = template_path.read_text(encoding="utf-8")
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model, quantization_config=bnb,
        device_map="auto", torch_dtype=torch.bfloat16)
    if args.adapter.lower() != "none":
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    source = args.data_dir / f"{args.split}.jsonl"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    errors_path = args.output.with_suffix(args.output.suffix + ".errors.jsonl")
    valid = invalid = recovered = 0
    with source.open(encoding="utf-8") as src, \
            args.output.open("w", encoding="utf-8") as dst, \
            errors_path.open("w", encoding="utf-8") as errors:
        for line in src:
            row = json.loads(line)
            messages = row["messages"][:-1]
            prompt = tok.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True,
                enable_thinking=False)
            inputs = tok(prompt, add_special_tokens=False,
                         return_tensors="pt")
            inputs = {k: v.to(model.get_input_embeddings().weight.device)
                      for k, v in inputs.items()}
            with torch.inference_mode():
                generated = model.generate(
                    **inputs, do_sample=False,
                    max_new_tokens=args.max_new_tokens,
                    pad_token_id=tok.pad_token_id,
                    eos_token_id=tok.eos_token_id)
            raw = tok.decode(
                generated[0, inputs["input_ids"].shape[1]:],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False)
            scores, error = parse_prediction(raw)
            if error:
                errors.write(json.dumps({
                    "example_id": row["example_id"],
                    "error": error,
                    "raw": raw,
                }, ensure_ascii=False) + "\n")
                if scores is None:
                    invalid += 1
                    continue
                recovered += 1
            if scores is None:
                continue
            dst.write(json.dumps({
                "example_id": row["example_id"],
                "persona_id": row["persona_id"],
                "day": row["day"],
                "trajectory": row["trajectory"],
                "scores": scores,
            }, ensure_ascii=False) + "\n")
            valid += 1
    print(
        f"predictions: valid={valid}, recovered={recovered}, "
        f"invalid={invalid}; errors={errors_path}")


if __name__ == "__main__":
    main()
