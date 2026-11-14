#!/usr/bin/env python3
"""train_qlora.py — QLoRA fine-tune of the student model on the SFT dataset.

Runs on the Verda VM (see ../README.md and docs/verda_training.md on branch
poc/laptop-markers). Defaults target a 24-48 GB card; on 16 GB keep
--per-device-bs 1 and lower --max-len to 2048.

    python3 scripts/train_qlora.py \
        --data-dir data/sft --base-model Qwen/Qwen3-8B \
        --out work_dirs/run1 [--merge-out work_dirs/run1/merged]

Outputs: OUT/adapter (LoRA weights) and optionally MERGE_OUT/ merged bf16
model for the llama.cpp GGUF conversion step.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, type=Path)
    ap.add_argument("--base-model", default="Qwen/Qwen3-8B")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lora-alpha", type=int, default=32)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--max-len", type=int, default=4096)
    ap.add_argument("--per-device-bs", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=16)
    ap.add_argument("--warmup-ratio", type=float, default=0.03)
    ap.add_argument("--merge-out", type=Path, default=None,
                    help="also write the merged bf16 model here")
    ap.add_argument("--seed", type=int, default=42)
    return ap.parse_args()


def main() -> None:
    args = parse_args()

    import torch
    from datasets import load_dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (AutoModelForCausalLM, AutoTokenizer,
                              BitsAndBytesConfig, Trainer, TrainingArguments)

    files = {n: str(args.data_dir / f"{n}.jsonl")
             for n in ("train", "val")
             if (args.data_dir / f"{n}.jsonl").exists()
             and (args.data_dir / f"{n}.jsonl").stat().st_size > 0}
    if "train" not in files:
        raise SystemExit(f"no train.jsonl in {args.data_dir} — run "
                         "build_dataset.py first")
    ds = load_dataset("json", data_files=files)

    tok = AutoTokenizer.from_pretrained(args.base_model)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    def to_text(batch):
        return {"text": [tok.apply_chat_template(m, tokenize=False)
                         for m in batch["messages"]]}

    ds = ds.map(to_text, batched=True,
                remove_columns=ds["train"].column_names)

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model, quantization_config=bnb,
        device_map="auto", torch_dtype=torch.bfloat16)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout, bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"]))
    model.print_trainable_parameters()

    def collate(features):
        enc = tok([f["text"] for f in features],
                  truncation=True, max_length=args.max_len,
                  padding="longest", return_tensors="pt")
        enc["labels"] = enc["input_ids"].clone()
        # completion-only loss: mask everything before the last assistant turn
        marker = tok.apply_chat_template(
            [{"role": "assistant", "content": ""}], tokenize=False)
        marker_ids = tok(marker, add_special_tokens=False)["input_ids"]
        for i, ids in enumerate(enc["input_ids"].tolist()):
            start = _last_sublist_index(ids, marker_ids)
            if start is None:               # template fallback: mask nothing
                continue
            enc["labels"][i, :start + len(marker_ids)] = -100
        enc["labels"][enc["input_ids"] == tok.pad_token_id] = -100
        return enc

    steps_per_epoch = max(1, len(ds["train"]) //
                          (args.per_device_bs * args.grad_accum))
    warmup_steps = int(args.warmup_ratio * steps_per_epoch * args.epochs)

    targs = TrainingArguments(
        output_dir=str(args.out / "trainer"),
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        per_device_train_batch_size=args.per_device_bs,
        per_device_eval_batch_size=args.per_device_bs,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=True,
        warmup_steps=warmup_steps,
        lr_scheduler_type="cosine",
        logging_steps=10,
        eval_strategy="epoch" if "val" in ds else "no",
        remove_unused_columns=False,   # keep `text` for the collate fn
        save_strategy="epoch",
        bf16=True,
        seed=args.seed,
        report_to=[],
    )
    trainer = Trainer(model=model, args=targs,
                      train_dataset=ds["train"],
                      eval_dataset=ds.get("val"),
                      data_collator=collate)
    trainer.train()

    adapter_dir = args.out / "adapter"
    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(adapter_dir)
    tok.save_pretrained(adapter_dir)
    (args.out / "run_config.json").write_text(json.dumps(vars(args),
                                                         default=str, indent=2))
    print(f"adapter saved to {adapter_dir}")

    if args.merge_out:
        merged = model.merge_and_unload()
        args.merge_out.mkdir(parents=True, exist_ok=True)
        merged.save_pretrained(args.merge_out)
        tok.save_pretrained(args.merge_out)
        print(f"merged model saved to {args.merge_out} — convert to GGUF with "
              "llama.cpp convert_hf_to_gguf.py + llama-quantize")


def _last_sublist_index(seq: list[int], sub: list[int]) -> int | None:
    if not sub:
        return None
    for i in range(len(seq) - len(sub), -1, -1):
        if seq[i:i + len(sub)] == sub:
            return i
    return None


if __name__ == "__main__":
    main()
