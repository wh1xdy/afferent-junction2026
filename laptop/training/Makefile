# afferent pose fine-tuning loop. Run on the host (tools venv) for data prep,
# or everything inside the image:  docker compose run --rm train make <target>
#
#   record -> extract -> prelabel -> (correct in CVAT) -> split -> train
#          -> evaluate -> export -> evaluate-onnx -> install-model

PY          ?= python3
DEVICE      ?= cpu
MANIFEST    ?= manifests/sessions.yaml
VIDEOS_DIR  ?= ../posture/recordings
POSTURE_MODELS ?= ../posture/models
DATA        ?= data
FPS         ?= 2
SEED        ?= 0
CONFIG      ?= configs/rtmpose-m_halpe26_finetune.py
WORK        ?= work_dirs/rtmpose-m_halpe26_ft
CKPT        ?= $(shell ls -t $(WORK)/best_*.pth 2>/dev/null | head -1)
ONNX        ?= work_dirs/export/rtmpose-m_halpe26_ft.onnx
AMP         ?=
EXTRA       ?=

.PHONY: help extract prelabel split train test export evaluate install-model tests check-env

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'

extract: ## sample frames from recordings listed in $(MANIFEST)
	$(PY) scripts/extract_frames.py --manifest $(MANIFEST) --videos-dir $(VIDEOS_DIR) \
		--out $(DATA)/frames --fps $(FPS) $(EXTRA)

prelabel: ## pre-annotate frames with rtmlib BodyWithFeet (COCO json for CVAT)
	$(PY) scripts/prelabel.py --frames $(DATA)/frames --out $(DATA)/annotations/prelabel.json \
		--device $(DEVICE) --cvat-label $(DATA)/annotations/cvat_skeleton.json $(EXTRA)

split: ## person-disjoint train/val/test from the CVAT-corrected export
	$(PY) scripts/split.py --ann $(DATA)/annotations/corrected.json \
		--frames-csv $(DATA)/frames/frames.csv --out $(DATA)/annotations --seed $(SEED) $(EXTRA)

train: ## fine-tune (inside the training image)
	AFFERENT_DATA_ROOT=$(abspath $(DATA))/ $(PY) scripts/train.py $(CONFIG) --work-dir $(WORK) \
		$(if $(AMP),--amp,) $(EXTRA)

test: ## mmpose test-set metrics (CocoMetric AP, bbox-PCK) on the best checkpoint
	AFFERENT_DATA_ROOT=$(abspath $(DATA))/ $(PY) scripts/train.py $(CONFIG) --work-dir $(WORK) \
		--test-only --checkpoint $(CKPT)

export: ## checkpoint -> rtmlib-compatible ONNX (+ parity check)
	$(PY) scripts/export_onnx.py $(CONFIG) $(CKPT) --out $(ONNX)

evaluate: ## baseline vs fine-tuned ONNX on the test split, rtmlib inference
	$(PY) scripts/evaluate.py --ann $(DATA)/annotations/test.json --img-root $(DATA)/frames \
		--frames-csv $(DATA)/frames/frames.csv --device $(DEVICE) \
		--model baseline=balanced --model ft=$(ONNX) --out work_dirs/eval/test_report.json

install-model: ## copy the ONNX (+ metadata json) into laptop/posture/models/custom
	mkdir -p $(POSTURE_MODELS)/custom
	cp $(ONNX) $(basename $(ONNX)).json $(POSTURE_MODELS)/custom/
	@echo "installed -> $(POSTURE_MODELS)/custom/$(notdir $(ONNX))"

tests: ## unit tests (numpy + pytest + pyyaml only)
	$(PY) -m pytest -q tests

check-env: ## print the training stack versions
	$(PY) -c "import torch,mmcv,mmengine,mmdet,mmpose;print(torch.__version__,torch.cuda.is_available(),mmcv.__version__,mmengine.__version__,mmdet.__version__,mmpose.__version__)"
