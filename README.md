# Personal Lang Coach

Browser-based pronunciation assessment app for the Livo AI SWE assessment.

## What it does

- Accepts English audio uploads between 15 and 45 seconds.
- Decodes and analyzes the recording locally in the browser with the Web Audio API.
- Produces a pronunciation score, component scores, timeline highlights, and coaching notes.
- Optionally uses an expected transcript for word-level highlighting; otherwise it highlights time segments.
- Stores no audio on a server by default.
- Offers optional text-only coaching from Qwen3 4B or Gemma 3 4B. The audio file never leaves the browser.

## Run locally

```bash
npm run dev
```

Then open `http://localhost:5173`.

The app has no build step and no runtime dependencies. Browser-only analysis is a static Vercel deployment.

## Optional Qwen3 / Gemma 3 coaching

Selecting a model sends the optional transcript and derived scores/issues to `/api/coach` after separate consent. It never sends the audio file. The API route expects an OpenAI-compatible chat-completions service, such as a managed inference provider, vLLM, or an Ollama-compatible gateway.

Configure these Vercel environment variables before enabling AI coaching:

```text
LLM_BASE_URL=https://your-inference-host/v1
LLM_API_KEY=server-side-secret
QWEN3_MODEL=Qwen/Qwen3-4B
GEMMA3_MODEL=google/gemma-3-4b-it
```

`QWEN3_MODEL` and `GEMMA3_MODEL` are optional overrides. The displayed model is only available when its configured endpoint exposes that model. Without `LLM_BASE_URL` and `LLM_API_KEY`, browser-only scoring continues to work and AI coaching reports that it is unconfigured.
