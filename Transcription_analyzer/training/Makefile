# Transcription analyzer — training pipeline.
# Local:   make dataset train eval
# Verda:   make verda-up verda-sync verda-train verda-pull verda-down
#          (same pattern as posture-analysis/training; see verda/README in
#           docs/verda_training.md on branch poc/laptop-markers)

PY        ?= python3
TRANSCRIPTS ?= data/transcripts
SFT_DIR   ?= data/sft
# Simulator records carry no `labels`; their injected `trajectory` is the
# ground truth. --derive-labels maps it to the output contract (records
# that DO carry teacher labels are unaffected).
DATASET_FLAGS ?= --derive-labels
BASE_MODEL ?= Qwen/Qwen3-8B
OUT       ?= work_dirs/run1
EPOCHS    ?= 2
MAX_LEN   ?= 4096
EXTRA     ?=

.PHONY: dataset train eval merge verda-up verda-sync verda-train verda-pull verda-down

dataset:
	$(PY) scripts/build_dataset.py --input-dir $(TRANSCRIPTS) --out-dir $(SFT_DIR) $(DATASET_FLAGS)

train:
	$(PY) scripts/train_qlora.py --data-dir $(SFT_DIR) --base-model $(BASE_MODEL) \
		--out $(OUT) --epochs $(EPOCHS) --max-len $(MAX_LEN) $(EXTRA)

merge:
	$(PY) scripts/train_qlora.py --data-dir $(SFT_DIR) --base-model $(BASE_MODEL) \
		--out $(OUT) --epochs 0 --merge-out $(OUT)/merged $(EXTRA)

eval:
	$(PY) scripts/eval_metrics.py --gold $(GOLD) --pred $(PRED) $(EXTRA)

verda-up:
	bash verda/up.sh

verda-sync:
	bash verda/sync.sh

verda-train:
	bash verda/train.sh

verda-pull:
	bash verda/pull.sh

verda-down:
	bash verda/down.sh
