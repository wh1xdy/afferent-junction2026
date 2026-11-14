# Voice relay (Cloud Run → Gemini Live on Vertex AI)

The app's **Talk** screen (`demo/js/voice.js`) streams the microphone to this relay, which talks to
Gemini Live on Vertex AI and streams the voice and the transcript back.

```
phone ──wss /live──► relay (Cloud Run) ──wss + OAuth──► Vertex AI Gemini Live
       {auth: code}   holds the Google identity, the model and the system prompt
```

Why a relay: the phone must not carry Google Cloud credentials, and a browser WebSocket cannot send
the `Authorization` header Vertex requires. The relay only accepts phones that send the access code
(`RELAY_CODE`) as their first message, sets the session up itself (model, voice, English-only prompt,
transcription on both sides), and forwards only audio from the phone, so the phone cannot change the
model or the prompt.

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
