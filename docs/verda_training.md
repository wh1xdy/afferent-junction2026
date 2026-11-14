# Remote fine-tuning on Verda — runbook

Everything needed to run `make train` on a rented Verda GPU VM, from an
empty account to a pulled checkpoint. The whole loop was validated live on
CLI v1.10.0 (Nov 2026); the gotchas below are the ones that actually bit.

Verda vs [Modal](../laptop/training/README.md#remote-training-on-modal):
Verda gives you a real VM you can ssh into (persistent disk, interactive
debugging) billed per started 10 min; Modal is serverless and proved
slightly less finicky. Both run the same `make` targets in the same image.

---

## 1. One-time setup (~5 min)

```bash
# CLI — check https://docs.verda.com for the current install line
verda doctor

# API credentials: console.verda.com -> Credentials -> Cloud API credentials
# -> Create -> copy Client ID + Client Secret (shown once)
verda auth login          # or: --client-id ... --client-secret ...
verda doctor && verda vm ls

# SSH key — injected into the VM at creation, used by sync.sh/train.sh
verda ssh-key add --name laptop --public-key "$(cat ~/.ssh/id_ed25519.pub)"
verda ssh-key list        # note the id -> SSH_KEY_ID in config.env
```

**Payment method is mandatory even with coupon credit.** Creating a VM
fails with `Compute cannot be deployed using <COUPON> balance until at
least one payment method is added` → console.verda.com → Billing → add a
card.

## 2. Pick an instance that is actually in stock

The catalog (`verda instance-types --gpu`) lists what *exists*, not what
has capacity — the two diverge within minutes. Always check:

```bash
verda availability --type 1V100.4V              # all locations
verda availability --type 1V100.4V --location FIN-01 --spot
```

| Type | $/hr (catalog) | GPU | Fits this stack? |
|---|---|---|---|
| `1V100.4V` | 0.24 (spot ~0.11 observed) | V100 16 GB | **Yes** — sm70, needs `OS_IMAGE=*-v100` variant + `AMP=1` |
| `1A6000.10V` | 0.88 | RTX A6000 48 GB | Yes — sm86 |
| `1A100.40S.22V` / `1A100.22V` | 1.69 / 2.37 | A100 40/80 GB | Yes — sm80, comfortable |
| `1RTXPRO6000.30V`, B200/B300/GB300 | ≥1.59 | Blackwell | **No** — sm120 needs torch ≥ cu128; ours is cu121 |

**Validated combo** (cheapest that worked, Nov 2026):
`INSTANCE_TYPE=1V100.4V LOCATION=FIN-01 OS_IMAGE=24.04.cuda12.9-v100.docker SPOT=1`
— the `-v100` image carries the proprietary driver V100 needs.

## 3. Configure

```bash
cd laptop/training
cp verda/config.env.example verda/config.env   # gitignored — safe to edit
```

Every variable is optional; the ones you will actually touch:

| Var | Default | Notes |
|---|---|---|
| `INSTANCE_TYPE` / `LOCATION` / `OS_IMAGE` | `1A100.40S.22V` / `FIN-02` / `24.04.cuda13.0.docker` | Must be in stock *now* — see §2 |
| `SPOT` | unset | `SPOT=1` → `--is-spot`: ~2-4× cheaper, evictable mid-run |
| `SSH_KEY` | unset | path to the *private* key registered with `verda ssh-key` |
| `SSH_KEY_ID` | first key in `ssh-key list` | set it explicitly if you have several keys |
| `DATA_DIR` | `laptop/training/data` | point at the capture dataset (§5) |
| `MAKE_TARGETS` | `train test` | forwarded to make on the VM |
| `AMP` | — | `AMP=1` recommended on 16 GB cards |
| `EXTRA` | — | appended to train, e.g. `--cfg-options train_cfg.max_epochs=1` |

Config file *or* environment — both work; env wins.

## 4. Prepare the dataset

From the capture app (`~/Documents/junction/capture/dataset`, see its
README): `make train-manifest` → `make extract` → annotation (API, or
`make prelabel` + `make render` QA fallback) → `make split`. You end up
with `frames/` + `annotations/{train,val,test}.json`. Only consenting,
pseudonymised (`Pxx`) data goes anywhere remote.

## 5. The loop

```bash
cd laptop/training

# up — prints IP, instance id, hourly price; waits for ssh-ready and
# seeds known_hosts (fixes the fresh-IP host-key prompt that kills verda ssh)
INSTANCE_TYPE=1V100.4V LOCATION=FIN-01 OS_IMAGE=24.04.cuda12.9-v100.docker \
  SPOT=1 make verda-up          # or plain: make verda-up

# sync — code + rtmlib ONNX (~200 MB) + dataset
DATA_DIR=/home/wameuh/Documents/junction/capture/dataset make verda-sync

# train — docker build on the VM (first run ~10-20 min), then the targets.
# Smoke-tested: check-env + a 1-epoch run on synthetic data.
MAKE_TARGETS="check-env train" AMP=1 \
  EXTRA="--cfg-options train_cfg.max_epochs=1" make verda-train

# pull — work_dirs/ back (checkpoints, logs, config)
make verda-pull

# down — pulls again unless SKIP_PULL=1, asks hostname confirmation,
# deletes the VM and sweeps leftover volumes (billing really stops)
make verda-down
```

Makefile targets just call `verda/*.sh`; running the scripts directly with
env overrides (as above) is equivalent.

On the VM: everything lands in `~/afferent/` (mirrors the repo layout),
docker runs `--gpus all` with `data/`, `work_dirs/`, `/cache` (torch hub +
ONNX cache, persists across `make` invocations) bind-mounted.

## 6. Verify billing stopped

```bash
verda vm ls           # -> "No instances found."
verda volume list     # -> "No volumes found."  (anything listed still bills)
```

`vm delete --with-volumes` alone was observed to leave the 100 GB OS
volume behind — `down.sh` sweeps leftovers, but the check above is the
ground truth.

## 7. Troubleshooting — errors actually hit

| Error | Cause | Fix |
|---|---|---|
| `Instance type not found` (400) | obsolete type (`1V100.6V`) | pick from `instance-types --gpu` |
| `cannot be deployed using ... coupon balance until ... payment method` | no card on file | console → Billing |
| `Not enough resources to deploy ... in FIN-0x` (503) | stock moved since `availability` | re-check availability; try another location or spot |
| `ssh_askpass ... Host key verification failed` (255) | fresh-IP host-key prompt without TTY | `up.sh` now keyscans; manual: `ssh-keyscan -t ed25519,ecdsa,rsa <IP> >> ~/.ssh/known_hosts` |
| `multi-select prompt ... stdin is not a TTY` on delete | `vm delete` storage prompt | handled: `--agent` flag in `down.sh` |
| OS volume still listed after delete | `--with-volumes` unreliable on v1.10.0 | `down.sh` sweeps; manual: `verda volume delete <id> --yes --agent` |
| `REMOTE_SCRIPT missing` style errors | ssh user mismatch (code in ~root vs ~ubuntu) | fixed: `SSH_USER` defaults to root everywhere |
| VM hostname is your laptop's name | old `HOSTNAME` env shadowing | fixed: variable is now `VM_HOSTNAME` |
| `REMOTE_SCRIPT` runs but GPU invisible | `--gpus all` needs the cuda-docker image | keep an `OS_IMAGE=*docker` slug |

## 8. Privacy / teardown checklist

- Only `frames/` + `annotations/` + code + rtmlib ONNX leave this machine;
  no raw video, no identity mapping, no credentials (`config.env` is
  rsync-excluded; `~/.verda/credentials` never leaves the laptop).
- `down.sh` destroys the OS volume containing the dataset copy and remote
  checkpoints — pull *before* down, or accept the loss (`SKIP_PULL=1`).
- Spot evictions lose `work_dirs/` mid-run; the VM does not checkpoint to
  your laptop. For real 60-epoch runs consider on-demand, or re-pull
  between long jobs.

---

Related: `verda/config.env.example` (all vars), `remote_train.sh` (what
runs on the VM), `modal/` scripts (the serverless alternative).
