# Content-safety checklist — social posts

Written 2026-08-29 as part of Task P (spiritual-text integrity + AI-content
safety, approved by Nick). Applies to every post generated via
`broadcast.mjs`, `broadcast-section.mjs`, `generate-video.mjs`,
`generate-clip.mjs`, and the daily blog routine — check new copy against
this list before it ships, the same way `sections.mjs` entries are reviewed.

## 1. No health-cure claims

Healing / psychotherapy content (backlog items H and I, not yet built) talks
about support, conversation, and help understanding — never a promise to
cure. Banned words/framings in RU and EN copy:
- ❌ «вылечу», «излечу», «гарантирую», «избавит от [болезни]», "I will cure
  you", "guaranteed to heal"
- ✅ «поддержка», «разговор», «помощь разобраться», "support", "a
  conversation", "help making sense of it"

Checked 2026-08-29: no existing script or generated caption contains this
pattern.

## 2. No guaranteed outcomes / fortune-telling as certainty

Readings are a mirror, not a prophecy. Keep the "зеркало, не предсказание"
framing everywhere a card/spread/coin result is described — never phrase a
result as a certain future event.
- ❌ «это точно произойдёт», «карта гарантирует», "this will definitely
  happen"
- ✅ «карта предлагает взгляд на ситуацию», «стоит задуматься о...», "a lens
  on the situation", "worth considering"

Checked 2026-08-29: no existing script or generated caption contains this
pattern.

## 3. AI-voice disclosure

Every daily video's narration is OpenAI TTS (`gpt-4o-mini-tts`) reading
generated text — not Nikolai's own recorded voice.
- (a) Never caption a clip as "голос Николая" / "Nikolai's voice" if the
  audio is synthetic. Say «озвучка» / "narration", or drop the attribution
  entirely (current captions already do this correctly — verified
  2026-08-29, no script attributes the TTS voice to Nick by name).
- (b) **No platform synthetic-media/AI-content disclosure toggle, anywhere,
  by deliberate choice.** `status.containsSyntheticMedia` was briefly set in
  `post-youtube.mjs` (2026-08-29) then removed 2026-08-31 after flagging the
  real platform-policy risk (reduced reach/possible strike) to Nick — he
  confirmed explicitly he accepts that tradeoff ("да сними"). Reaffirmed
  2026-09-01: don't tick any such toggle on any platform (Instagram, TikTok,
  etc.) going forward either. (a) above still stands — never *claim* the
  voice is Nikolai's own — this is only about not proactively flagging the
  narration as AI-generated to the platform.

## 4. No manipulative religious framing

Never frame an action as a transaction with God or a shortcut to being
heard.
- ❌ «нажми — и Бог услышит», «поставь лайк, чтобы молитва сбылась», "tap to
  make God listen"
- ✅ describe what the feature does («попроси о заступничестве», "ask for
  intercession") without implying the app mediates or accelerates God's
  attention.

Checked 2026-08-29: no existing script or generated caption contains this
pattern.

## 4b. No overclaiming technical capabilities

Only say the app "works offline" / "без интернета" for a feature that is
actually pure client-side logic (no fetch calls at all) — e.g. Breathing
Anchor (local timer + Web Audio tones only). Never say it about a feature
that calls the AI interpretation API, syncs to the server (history, Temple
candle count, Path21 progress), or fetches live data (Sky Today's
geomagnetic feed) — those need a connection, and any write attempted while
offline currently fails silently (`saveHistoryEntry` etc. catch the network
error and return `null`, no queue/retry). Caught 2026-08-29: Nick asked
directly whether the app really works offline after reading it in the new
Preview page's description, which had generalized from the "oracle"
section's own pre-existing (also inaccurate) social copy — both fixed to
drop the claim except where it's actually true.

## 5. Book excerpts (backlog item J — Голос Господа reels)

Paraphrase Nick's own stories in his voice; never quote the manuscript
verbatim (rights/attribution risk), and nothing political. Only positive /
transformation material — see the backlog entry for the full rule.

## 6. Spiritual-text sourcing (in-app readings, not social copy)

Covered separately — see the per-entry `source`/`sourceEn` labels in
`src/data/path21*Readings*.ts` and Task P part 1 (commits c80f6f2, 9ef33d2,
12d3786). Every reading is now a genuine verbatim public-domain quote or a
real citation matching its theme — no AI-composed text is presented as
scripture or tradition.
