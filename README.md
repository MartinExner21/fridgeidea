# FridgeIdea

Mobilforst Next.js-app der laver tre opskriftsideer ud fra:

- billede af køleskab med SkoleGPT billedanalyse
- tekst- eller lydinput til ønsker, budget og kalorier
- inspirationslinks fra fx Pinterest, Instagram, TikTok eller opskriftssider
- valg mellem kun at bruge køleskabet eller at foreslå få indkøb

Appen er bygget til Vercel. API-nøgler ligger kun server-side i Vercel environment variables.

## Lokal udvikling

```bash
pnpm install
pnpm dev
```

Åbn `http://localhost:3000`.

## Vercel Environment Variables

Sæt disse i Vercel Project Settings -> Environment Variables:

```bash
SKOLEGPT_API_URL=https://llm.dbc.dk/v1/chat/completions
SKOLEGPT_API_KEY=
SKOLEGPT_MODEL=google/gemma-4-26B-A4B-it
SKOLEGPT_VISION_MODEL=google/gemma-4-26B-A4B-it
SKOLEGPT_STT_API_URL=
PEXELS_API_KEY=
GOOGLE_SEARCH_API_KEY=
GOOGLE_CSE_ID=
```

`PEXELS_API_KEY` bruges som førstevalg til opskriftsbilleder. Pexels er gratis og giver stabile madfotos.

`GOOGLE_SEARCH_API_KEY` og `GOOGLE_CSE_ID` bruges til opskriftsbilleder via Google Custom Search med `searchType=image`. Hvis de mangler, forsøger appen først almindelig Google-billedsøgning og bruger derefter en madfoto-fallback.

Valgfrit, hvis du senere vil bruge eksisterende TTS-rute:

```bash
SKOLEGPT_TTS_API_URL=https://glyph-gate.dbc.dk/v1/audio/speech
SKOLEGPT_TTS_API_KEY=
SKOLEGPT_TTS_MODEL=CoRal-project/roest-v3-chatterbox-500m
```

Hvis `SKOLEGPT_API_URL` mangler, viser appen demo-opskrifter og demo-billedanalyse, så UI kan testes uden nøgler. STT kræver `SKOLEGPT_STT_API_URL`.

## GitHub og Vercel

Der er ikke `gh` eller `vercel` CLI installeret i dette miljø. Projektet er derfor gjort klar som almindeligt Git-repo:

```bash
git remote add origin git@github.com:<brugernavn>/fridgeidea.git
git push -u origin main
```

Opret derefter et Vercel-projekt fra GitHub-repoet, vælg `Next.js`, og tilføj environment variables ovenfor.
