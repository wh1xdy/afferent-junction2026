import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "analyzer"))

from scripts import build_dataset
from scripts.train_qlora import completion_encoding
from analyzer.backend import render_qwen3


@pytest.fixture(scope="module")
def built_dataset(tmp_path_factory):
    output = tmp_path_factory.mktemp("sft")
    old_argv = sys.argv
    sys.argv = [
        "build_dataset.py",
        "--input-dir", str(ROOT / "data/transcripts"),
        "--out-dir", str(output),
        "--derive-labels",
        "--tokenizer", str(ROOT / "models/qwen3-8b-lora-run1"),
    ]
    try:
        build_dataset.main()
    finally:
        sys.argv = old_argv
    from transformers import AutoTokenizer

    tokenizer_path = ROOT / "models/qwen3-8b-lora-run1"
    tok = AutoTokenizer.from_pretrained(tokenizer_path, local_files_only=True)
    if not tok.chat_template:
        tok.chat_template = (tokenizer_path / "chat_template.jinja").read_text()
    return output, tok


def test_assistant_only_mask_and_template(built_dataset):
    output, tok = built_dataset
    splits = []
    for split in ("train", "val", "test"):
        path = output / f"{split}.jsonl"
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        splits.extend(rows)
    assert splits
    for row in splits:
        messages = row["messages"]
        ids, labels = completion_encoding(messages, tok, 4096)
        completion = [token for token in labels if token != -100]
        assert completion
        full_text = tok.apply_chat_template(
            messages, tokenize=False, enable_thinking=False)
        prefix_text = tok.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True,
            enable_thinking=False)
        assert render_qwen3(messages[:-1]) == prefix_text
        suffix_text = tok.decode(
            completion, skip_special_tokens=False,
            clean_up_tokenization_spaces=False)
        assert suffix_text == full_text[len(prefix_text):]
        assert suffix_text.startswith(messages[-1]["content"])
        assert "<|im_end|>" in suffix_text
        assert len(ids) <= 4096
