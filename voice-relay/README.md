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

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `RELAY_CODE` | *(empty: every phone refused)* | Shared access code the app sends first. |
| `GOOGLE_CLOUD_PROJECT` | from the credentials | Project that pays for Vertex. |
| `VERTEX_LOCATION` | `us-central1` | Vertex region (`global` is not supported by the Live API). |
| `VERTEX_MODEL` | `gemini-3.8-live` | Live model ID. |
| `VOICE_NAME` | `Kore` | Prebuilt voice. |
| `MAX_SESSION_SECONDS` | `900` | Hard stop per conversation. Vertex itself ends connections after about 10 minutes. |

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
  --allow-unauthenticated --timeout 3600 --max-instances 2 \
  --set-env-vars RELAY_CODE=$CODE,GOOGLE_CLOUD_PROJECT=$PROJECT,VERTEX_LOCATION=us-central1
```

`--allow-unauthenticated` is needed because the phone cannot sign in to Google Cloud; the access code
is what keeps strangers out. `--max-instances 2` caps the cost if the code leaks. The command prints
the service URL; check it with:

```sh
curl https://afferent-voice-….run.app/health       # {"ok":true,"configured":true}
```

To change the code later: `gcloud run services update afferent-voice --region europe-north1 --update-env-vars RELAY_CODE=new-code`.

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
