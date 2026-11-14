# Voice relay (Cloud Run → Gemini Live on Vertex AI)

The app's **Talk** screen (`demo/js/voice.js`) streams the microphone to this relay, which talks to
Gemini Live on Vertex AI and streams the voice and the transcript back.

```
phone ──wss /live──► relay (Cloud Run) ──wss + OAuth──► Vertex AI Gemini Live
   {auth, context?}   holds the Google identity, the model and the system prompt
```

Why a relay: the phone must not carry Google Cloud credentials, and a browser WebSocket cannot send
the `Authorization` header Vertex requires. The relay only accepts phones that send the access code
(`RELAY_CODE`) as their first message, sets the session up itself (model, voice, prompt,
transcription on both sides), and forwards only audio from the phone, so the phone cannot change the
model or the prompt.

The prompt offers two approaches: everyday topic invitations for light conversation or a starting
point, and active listening in the spirit of Carl Rogers when someone shares an experience or feeling.
Most listening replies are brief reflections without questions; questions are occasional invitations,
never asked on successive replies or repeated when they get no uptake. Silence is allowed rather
than filled with prompts. It is not an assistant and does not do research or tasks; the safety lines
(support button, 112) are always in.

## Listening design and references

The listening approach draws on empathy, nonjudgmental acceptance, and attending to meaning and
feelings. Limits on questions, allowing silence, and avoiding repeated prompts are conversational
design adaptations, not literal rules from these papers. These works concern human relationships and
therapy; they are not evidence of the efficacy or safety of AI for depression. The companion is not
psychotherapy or a substitute for care.

- Rogers, C. R., & Farson, R. E. (1957). *Active listening*. Industrial Relations Center, University of
  Chicago. [Original edition catalog](https://search.worldcat.org/title/Active-listening/oclc/7022047);
  [excerpt](https://www.gordontraining.com/wp-content/uploads/ActiveListening_RogersFarson.pdf)
  (excerpt, not the full original).
- Rogers, C. R. (1957). The necessary and sufficient conditions of therapeutic personality change.
  *Journal of Consulting Psychology, 21*(2), 95–103. https://doi.org/10.1037/h0045357

Once a day the phone asks its home hub for a wellbeing read (`GET /api/patients/{pid}/wellbeing`,
see the main README) and may pass it in the auth message as `context`:
`{indicator: "ok"|"watch"|"bad", date, facts: […], suggest_doctor}`. The relay validates and
truncates it (`clean_context`), then appends it to the system instruction under a fixed header — the
phone can colour today's session, never rewrite the prompt. On a `bad` day the companion is asked to
gently raise the facts, remind the person their care team is there, and suggest once — without
pushing — that they talk to their doctor.

Privacy: audio passes through Google while a conversation is open. The relay stores nothing and logs
no audio or text. The transcript is kept on the phone only.

## Shared dashboards ("Show to my doctor")

The relay also keeps the patient's dashboard for "Show to my doctor", locked so that it cannot read it:

```
phone ──POST /share (X-Afferent-Code, locked bytes)──► relay ──► {id, expires, revoke}
code on the phone's screen: https://<relay>/d/<id>#<key>
doctor ──GET /d/<id>──► viewer page ──GET /d/<id>/blob──► locked bytes, unlocked in the browser
phone ──DELETE /d/<id> (X-Revoke-Token)──► taken back
```

- The phone locks the dashboard itself (`demo/js/handover.js`: AES-GCM, a fresh random 256-bit key per share)
  and sends only the result: one format byte, the nonce, the ciphertext. The key is the part of the link after
  `#`, which browsers never send, so it never reaches the relay, its logs or Google's front end.
- `viewer.html` (served at `/d/<id>`) unlocks it in the doctor's browser and shows it in a sandboxed frame.
  Its policy lets that frame reach only this relay, so the dashboard cannot send anything elsewhere.
- Uploads need the same access code as `/live`. Limits: about 2 MB per share, 7 days, 30 uploads an hour and
  120 reads a minute per address, at most 500 shares or 64 MB in all (`SHARE_*` below). A share ends after
  7 days or when the patient takes it back with the revoke token it got at upload.
- **Kept in memory.** A restart, a redeploy or a scale-down to zero drops every share (the patient then
  makes a new code), and a second instance would not know the first one's shares. So deploy with exactly
  one instance kept warm: `--min-instances 1 --max-instances 1`. A bucket would lift this; there is none yet.

Tests: `pytest test_main.py` (the share tests need no Google account either).

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `RELAY_CODE` | *(empty: every phone refused)* | Shared access code the app sends first. |
| `GOOGLE_CLOUD_PROJECT` | from the credentials | Project that pays for Vertex. |
| `VERTEX_LOCATION` | `us-central1` | Vertex region (`global` is not supported by the Live API). |
| `VERTEX_MODEL` | `gemini-3.8-live` | Live model ID. |
| `VOICE_NAME` | `Kore` | Prebuilt voice. |
| `MAX_SESSION_SECONDS` | `900` | Hard stop per conversation. Vertex itself ends connections after about 10 minutes. |
| `SHARE_TTL_SECONDS` | `604800` | How long a shared dashboard stays (7 days). |
| `SHARE_MAX_BYTES` | `2097152` | Largest share (2 MB). |
| `SHARE_TOTAL_BYTES` / `SHARE_MAX_COUNT` | `67108864` / `500` | Ceiling for all shares together; above it uploads get 503. |
| `SHARE_UPLOADS_PER_HOUR` / `SHARE_READS_PER_MINUTE` | `30` / `120` | Per client address (the last `X-Forwarded-For` entry). |

## Deploy (once, ~10 min)

Needs the [gcloud CLI](https://cloud.google.com/sdk/docs/install), logged in (`gcloud auth login`),
and a project with billing on.

```sh
PROJECT=your-project-id
CODE=$(openssl rand -hex 16); echo "Access code: $CODE"   # keep it, the app needs it

gcloud config set project $PROJECT
gcloud services enable aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud iam service-accounts create afferent-voice --display-name "Afferent voice relay"
gcloud projects add-iam-policy-binding $PROJECT \
  --member serviceAccount:afferent-voice@$PROJECT.iam.gserviceaccount.com --role roles/aiplatform.user

cd voice-relay
gcloud run deploy afferent-voice --source . --region europe-north1 \
  --service-account afferent-voice@$PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated --timeout 3600 --min-instances 1 --max-instances 1 \
  --set-env-vars RELAY_CODE=$CODE,GOOGLE_CLOUD_PROJECT=$PROJECT,VERTEX_LOCATION=us-central1
```

`--allow-unauthenticated` is needed because the phone cannot sign in to Google Cloud; the access code
is what keeps strangers out. One instance, kept warm, holds every shared dashboard (above) and caps the
cost if the code leaks; one instance takes many voice conversations at once. The command prints
the service URL; check it with:

```sh
curl https://afferent-voice-….run.app/health       # {"ok":true,"configured":true}
```

To change the code later: `gcloud run services update afferent-voice --region europe-north1 --update-env-vars RELAY_CODE=new-code`.

Already deployed? A redeploy keeps the service account, the variables and the other settings; add the
shares' instance settings once:

```sh
cd voice-relay
gcloud run deploy afferent-voice --source . --region europe-north1 --min-instances 1 --max-instances 1
URL=$(gcloud run services describe afferent-voice --region europe-north1 --format 'value(status.url)')
curl -s $URL/health                                          # {"ok":true,"configured":true}
head -c 64 /dev/urandom | { printf '\001'; cat; } | curl -s -X POST $URL/share \
  -H "X-Afferent-Code: $CODE" -H 'Content-Type: application/octet-stream' --data-binary @-   # {"id":…,"expires":…,"revoke":…}
```

The second check stores 65 random bytes as a share; it ends by itself after 7 days, or
`curl -X DELETE $URL/d/<id> -H 'X-Revoke-Token: <revoke>'` drops it at once.

## Point the app at it

At build time (written to `demo/js/voice-config.js`, which git ignores):

```sh
VOICE_RELAY_URL=https://afferent-voice-….run.app VOICE_RELAY_CODE=$CODE npm run sync
```

Or on the phone: open **Talk**, tap **Start talking**, and enter the address and code in the form
that appears. A value typed on the phone wins over the built-in one.

## Run locally

```sh
gcloud auth application-default login
cd voice-relay && pip install -r requirements.txt
RELAY_CODE=dev GOOGLE_CLOUD_PROJECT=your-project-id uvicorn main:app --port 8080
```

Then use `http://<your-computer-ip>:8080` as the relay address (the phone must be on the same network).

Tests (a fake Vertex, no Google account needed): `pip install pytest httpx && pytest test_main.py`.
