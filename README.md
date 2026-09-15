# Никола Блажен — social media rendering & posting

Public mirror of the daily video-rendering + social-posting pipeline for
[nikolablajen.ru](https://nikolablajen.ru) (the main app/site lives in a
separate private repo, `nikolablajen_app`). Split out on 2026-09-15 purely
for GitHub Actions billing reasons — public repos get free, unlimited
Actions minutes; this pipeline's daily video rendering (ffmpeg + OpenAI TTS
+ Whisper) was the single biggest consumer of the private repo's paid
Actions minutes.

## What's here

- `scripts/social/generate-video*.mjs` — renders the daily vertical
  (1080×1920) videos: card of the day (3-deck pool), Tarot (Rerih deck),
  "Выбери карту" pick-a-card (+ relationship/MAK themes), Elena stream,
  Расклад-послание, monthly horoscope, astro-event calendar.
- `scripts/social/post-*.mjs` — publishes to Instagram, Facebook, Telegram,
  YouTube, Threads, TikTok, Bluesky, Tumblr (VK is disabled, see
  `post-vk.mjs`'s own header).
- `scripts/blog/collections.mjs` / `horoscope-data.mjs` — small shared
  helpers these scripts depend on (relationship-theme card filtering,
  horoscope phrase-pool fallback).
- `src/data/*.json` / `public/decks/*` — the 4 decks' card text + art,
  copied straight from the main app repo. **Keep in sync by hand** if the
  main repo's deck data ever changes — there's no automated sync.
- No secrets, no personal/business logic, no user data, no payment code —
  this repo is exactly the rendering pipeline and nothing else.

## What's NOT here (stays in the private `nikolablajen_app` repo)

The razbor/sovet/zdorovie promo streams and the text-only daily horoscope
stay in the private repo — those workflows write pages back into the
site's own `public/blog/novosti/` and are tightly coupled to the app's own
content/queue management, unlike the pure render-and-post streams here.

## Secrets

All posting tokens (Meta/YouTube/Telegram/TikTok/Bluesky/Tumblr, plus
`OPENAI_API_KEY`/`ELEVENLABS_API_KEY`, plus `GH_ASSETS_TOKEN`/
`GH_SECRETS_PAT` for the shared `nikolablajen-assets` hosting repo and
rotating-token self-heal) are configured as this repo's own GitHub
Secrets — same names as the private repo used, migrated once on setup.
