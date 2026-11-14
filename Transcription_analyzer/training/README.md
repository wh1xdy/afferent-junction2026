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
        │                            split BY PERSONA — no speaker leakage
        ▼  make train
work_dirs/run1/adapter/           <- LoRA weights + run_config.json
        │  (optional) --merge-out work_dirs/run1/merged
        ▼
merged bf16 model -> llama.cpp convert_hf_to_gguf.py + llama-quantize
        -> student-q5_k_m.gguf -> Jetson /data/models/
```

`build_dataset.py` imports the analyzer package itself for metrics and the
prompt — the model literally trains on the strings it will see at runtime.

## Verda loop

```sh
cp verda/config.env.example verda/config.env   # edit: instance, ssh key
verda/up.sh                                    # create the GPU VM
verda/sync.sh                                  # push training/ + analyzer/ + data/
verda/train.sh                                 # docker build + `make dataset train`
verda/pull.sh                                  # fetch work_dirs/ back
verda/down.sh                                  # delete VM + volumes (billing stops)
```

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

`eval_metrics.py` reports Pearson r per dimension and AUROC/accuracy on
`drift_flag` — the success gate in ../README.md §7 is "fine-tune beats the
frozen baseline on held-out personas".

## Privacy

Only **synthetic** transcripts ever leave the machine. `verda/config.env`
is rsync-excluded and gitignored; `down.sh` destroys the remote dataset copy
and checkpoints — pull first, or accept the loss.
