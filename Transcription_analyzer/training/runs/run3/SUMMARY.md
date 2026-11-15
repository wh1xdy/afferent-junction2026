# Run 3 — rapport

## Infra
- GPU : 1×A100 80 GB (Verda `1A100.22V`, FIN-01, ~2.16 $/h) — VM supprimée après pull
- Durée : ~1 h 10 au total (setup natif torch cu128 + dataset + train 42 min + 3 passes de prédictions)
- Mode : REMOTE_MODE=native (venv uv python3.12 sur la VM)

## Données
- Corpus : 43 transcripts v2 (`data/transcripts/`, personas p001_maggie ×39, p002_marcus ×4)
- Dataset : **921 exemples** — train 882 / val 0 / test 39 (split par persona : test = p002_marcus, locuteur jamais vu ; val vide car 2 personas — attendu)
- Tokens : min 1 623 / médiane 2 916 / max 3 818 (< MAX_LEN 4096)
- États (tous splits) : normal 427, joyful 365, sad 81, depressed 48

## Training
- `make dataset train`, EPOCHS=2, hyperparams inchangés (r16/alpha32/lr2e-4/bs1/accum16/seed42)
- train_loss final 0.0519 ; pas d'eval_loss (val vide)
- **Adapter retenu : epoch 1** = `trainer/checkpoint-56` (copié en `adapter_ep1/`), quasi identique à epoch 2 et moins overfit — cohérent avec le run 2

## Résultats test (n=39, --join-on example_id, max-new-tokens 1200)

| métrique | adapter ep1 | adapter ep2 | base |
|---|---|---|---|
| AUROC drift | **0.989** | 0.989 | 0.954 |
| accuracy drift | **0.846** | 0.846 | 0.769 |
| Pearson responsiveness | **0.967** | 0.966 | 0.550 |
| engagement | **0.956** | 0.954 | 0.909 |
| fluency | **0.960** | 0.959 | 0.472 |
| coherence | **0.955** | 0.955 | 0.715 |

Prédictions : adapter 39/39 valides (0 recovered), base 39/39 (39 recovered — sorties réparées, à garder en tête).
Caveat : les gold labels sont des constantes dérivées par `trajectory` — les Pearson élevés mesurent surtout la séparation des états.

## Décision
**L'adapter bat la base sur le test** (AUROC + toutes les Pearson) → le critère §7 est rempli : on peut remplacer le modèle de base sur le Jetson.

## Artefacts
- `work_dirs/run3/adapter_ep1/` (adapter epoch 1 retenu) + `adapter/` (epoch 2)
- `work_dirs/run3/metrics.jsonl`, `predictions/test_{adapter,adapter_ep1,base}.jsonl` + `.errors.jsonl`
- `work_dirs/run3/eval/test_{adapter,adapter_ep1,base}.report.json` + `test_gold.jsonl`
- `analyzer/models/student-lora-run3-f16.gguf` (167 Mo, 504 tenseurs, llama.cpp b5283)

## Intégration Jetson (reste à faire)
`analyzer/configs/jetson.yaml` → `lora_path: /app/models/student-lora-run3-f16.gguf` (et adapter le check Dockerfile `student-lora-f16.gguf` si besoin).
