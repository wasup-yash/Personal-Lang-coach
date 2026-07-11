# Personal Lang Coach

Browser-based pronunciation assessment app for the Livo AI SWE assessment.

## What it does

- Accepts English audio uploads between 15 and 45 seconds.
- Decodes and analyzes the recording locally in the browser with the Web Audio API.
- Produces a pronunciation score, component scores, timeline highlights, and coaching notes.
- Optionally uses an expected transcript for word-level highlighting; otherwise it highlights time segments.
- Stores no audio on a server by default.

## Run locally

```bash
npm run dev
```

Then open `http://localhost:5173`.

The app has no build step and no runtime dependencies. It is a static Vercel deployment.

## Test

```bash
npm test
```

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Keep the framework preset as `Other`.
4. Leave build command empty.
5. Leave output directory empty, or set it to `.`.
6. Deploy.

The included `vercel.json` config serves `index.html` for browser routes and adds basic security headers.

## Deliverables

- App source: this repository.
- Architecture white paper: `docs/livo-architecture-whitepaper.docx` and `docs/livo-architecture-whitepaper.pdf`.
- Deployment target: Vercel static hosting.
