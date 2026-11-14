# training — student model on Verda

QLoRA distillation of the teacher's labels into an 8B dense student
(default `Qwen/Qwen3-8B`), destined for GGUF Q5_K_M on the Jetson.

Workflow, same pattern as `posture-analysis/training` (runbook:
`docs/verda_training.md`, branch `poc/laptop-markers` — the verda scripts
here are an adapted copy of those).

## Pipeline

```
data/transcripts/*.jsonl          <- two-agent simulator output
        │  make dataset
        ▼
data/sft/{train,val,test}.jsonl   <- chat-format examples (prompt = the
        │                            analyzer's exact inference prompt,
        │                            completion = labels in the output contract)
        │                            split by persona when possible, otherwise
        │                            stratified by file for this corpus
        ▼  make train
work_dirs/run1/adapter/           <- LoRA weights + run_config.json
        │  (optional) --merge-out work_dirs/run1/merged
        ▼
merged bf16 model -> llama.cpp convert_hf_to_gguf.py + llama-quantize
        -> student-q5_k_m.gguf -> Jetson /data/models/
```

`build_dataset.py` imports the analyzer package itself for metrics and the
prompt — the model literally trains on the strings it will see at runtime.
Windows are capped at 120 turns and 9000 rendered transcript characters.
The builder loads `../models/qwen3-8b-lora-run1` offline for exact token counts
and fails if any full chat example exceeds 4096 tokens; it never silently
truncates examples. The completion-only mask trains on the assistant JSON,
using the same `enable_thinking=False` template as inference.

```sh
make dataset TRANSCRIPTS=../data/transcripts SFT_DIR=data/sft \
  MAX_LEN=4096 MAX_WINDOW_CHARS=9000 DATASET_FLAGS=--derive-labels
```

The dataset report includes token min/median/max and state counts per split.
`training/scripts/predict.py` runs deterministic test/validation predictions
with either `--adapter work_dirs/run2/adapter` or `--adapter none`.
`train_qlora.py` writes per-step train/eval history to `metrics.jsonl`.

## Verda loop

```sh
cp verda/config.env.example verda/config.env   # edit: instance, ssh key
verda/up.sh                                    # create the GPU VM
verda/sync.sh                                  # push training/ + analyzer/ + data/
verda/train.sh                                 # build, train, then predict test/val
verda/pull.sh                                  # fetch work_dirs/ back
verda/down.sh                                  # delete VM + volumes (billing stops)
```

For the approved RTX PRO 6000 CC run, use `bash verda/run_native_run2.sh`.
It selects Ubuntu 24.04 CUDA 13.2 CC, installs training natively (no Docker),
checks CUDA before training, and reserves teardown time within a 2.5-hour cap.
The normal `verda/train.sh` path remains Docker-based unless `REMOTE_MODE=native`
is set.

Or via make: `make verda-up verda-sync verda-train verda-pull verda-down`.

Instance sizing (catalog: `verda instance-types --gpu`, stock:
`verda availability --type X`):

| Card | Fits? |
|---|---|
| `1A6000.10V` (48 GB) | default — 8B QLoRA at max-len 4096 |
| `1A100.40S.22V` (40 GB) | yes |
| `1V100.4V` (16 GB) | only with `EXTRA="--max-len 2048"` + `OS_IMAGE=*-v100` |

The student is a **dense** architecture on purpose: vanilla QLoRA tooling,
GGUF conversion, and llama.cpp all work out of the box. Swapping in
`nvidia/Llama-3.1-Nemotron-Nano-8B-v1` is a one-line `BASE_MODEL=` change.

## Evaluation

Gold labels are injected by the simulator, so eval is direct:

```sh
# score test.jsonl windows with the frozen few-shot base, then with the
# adapter -> two pred files, then:
make eval GOLD=data/sft/test.jsonl PRED=preds_base.jsonl
make eval GOLD=data/sft/test.jsonl PRED=preds_finetuned.jsonl
```

For predictions produced by `predict.py`, use `--join-on example_id` so
multiple windows from the same day are evaluated independently.

After pulling a successful run, compare its predictions and convert the
adapter without replacing the deployed run-1 artifact:

```sh
make eval GOLD=data/sft/test.jsonl \
  PRED=work_dirs/run2/predictions/test_adapter.jsonl \
  EXTRA="--join-on example_id"
make eval GOLD=data/sft/test.jsonl \
  PRED=work_dirs/run2/predictions/test_base.jsonl \
  EXTRA="--join-on example_id"
LORA_DIR="$PWD/work_dirs/run2/adapter" \
OUTPUT_PATH="$PWD/../analyzer/models/student-lora-run2-f16.gguf" \
  bash ../analyzer/scripts/build_lora_gguf.sh
```

`eval_metrics.py` reports Pearson r per dimension and AUROC/accuracy on
`drift_flag` — the success gate in ../README.md §7 is "fine-tune beats the
frozen baseline on held-out personas (or held-out files for this single-persona
synthetic corpus)".

## Privacy

Only **synthetic** transcripts ever leave the machine. `verda/config.env`
is rsync-excluded and gitignored; `down.sh` destroys the remote dataset copy
and checkpoints — pull first, or accept the loss.
