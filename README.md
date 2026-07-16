# Personal Lang Coach

English and Hindi pronunciation practice with a private browser-only fast path and an optional authenticated ASR pipeline for detailed phoneme feedback.

## Product behavior

- The default 15-45 second assessment runs entirely in the browser and works without accounts, storage, or an ASR backend.
- It scores acoustic clarity, fluency/pause control, language-specific pace, and duration compliance. This is practice feedback, not a certified phoneme grade.
- Qwen3 4B and Gemma 3 4B coaching remains text-only: it receives an optional transcript and derived findings, never raw audio.
- Signed-in users can opt into detailed feedback. The browser uploads audio directly to an encrypted transient S3/R2 object through a 5-minute presigned POST with an enforced 25 MB policy; Vercel receives only a job key, and the FastAPI ASR service explicitly deletes the object after processing.

## Detailed ASR pipeline

`browser -> presigned S3/R2 PUT -> FastAPI /asr -> faster-whisper -> WhisperX alignment -> wav2vec2 CTC posterior GOP -> result -> explicit object deletion`

The FastAPI service accepts either an object-key job (`POST /asr`, production) or a multipart file (`POST /asr/upload`, integration testing). It returns transcript, word timestamps/confidences, phoneme spans, raw GOP, calibration status, and per-stage latency. Vercel authenticates every detailed job with Supabase httpOnly session cookies and applies a per-user rate limit through Upstash Redis.

## Calibration status

English is only labeled calibrated after `backend/scripts/calibrate_english.py` has been run against human-rated, held-out-speaker L2-ARCTIC-derived data and its output replaces the placeholder `backend/calibration/english_gop_isotonic.json`. Until then the UI and API must treat scores as uncalibrated. Hindi has no equivalent standard learner-speech corpus in this project; Hindi phoneme GOP is explicitly returned as experimental/uncalibrated until a separately collected, consented, human-rated Hindi dataset is available.

## Run the browser app

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Copy `.env.example` into your deployment environment before enabling auth, storage, ASR, monitoring, or LLM coaching.

## Run the ASR service

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For CPU development set `ASR_DEVICE=cpu` and `ASR_COMPUTE_TYPE=int8`; deploy the Docker image to a GPU service for production. The service exposes `/healthz` and Prometheus `/metrics`; import `monitoring/grafana-dashboard.json` and configure Sentry on both Vercel and the backend with `SENTRY_DSN`.

## Storage and deletion controls

- Create a private bucket, enforce TLS, enable default SSE-S3 or KMS encryption, and apply `infra/bucket-cors.json` with the real Vercel domain. The storage provider must support presigned POST policies with a `content-length-range` condition.
- Apply the `jobs/` lifecycle configuration in `infra/s3-lifecycle.json` as a one-day deletion backstop. S3 lifecycle expiry is evaluated daily, so explicit deletion in FastAPI remains the primary control.
- Apply `supabase/migrations/20260717_pronunciation_history.sql`. Account deletion first removes all `jobs/{userId}/` objects, then deletes the Supabase Auth user; the foreign key cascades saved history. `/api/auth/export` returns the user's stored history as JSON.

## Vercel environment variables

Use the values documented in `.env.example`. Production deployments require `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `APP_ORIGIN`; rate limiting fails closed when Redis is absent. `ASR_SERVICE_URL` must point to the independently deployed FastAPI service and `ASR_SERVICE_TOKEN` must match its `ASR_SERVICE_TOKEN`. Protect Prometheus with `METRICS_TOKEN`.

## Test

```bash
npm test
npm run test:e2e
python -m compileall backend/app
```
