// Renders a vertical (1080x1920) "card of the day" video for social posting:
// card art with a Ken Burns motion (one of a few rotating patterns), title +
// teaser text overlay, spoken narration of the teaser (OpenAI TTS), and a
// nikolablajen.ru watermark. Card data comes straight from src/data/*.json,
// same files the app itself ships — no network call for that part.
//
// Usage: node scripts/social/generate-video.mjs [--locale=ru|en] [--out=dir]
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickHashtags } from './hashtags.mjs'
import { generateCardArticle, generateHeadline } from './prompts.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const DECKS = [
  { key: 'golos', total: 69 },
  { key: 'poslaniya', total: 80 },
  { key: 'probuzhdenie', total: 54 },
]

// Decks with separate English-text card art (see src/data/decks.ts'
// DECKS_WITH_EN_IMAGES — keep these two in sync). Other decks have no -en.jpg
// art yet, so an English video/post for them still uses the Russian image.
const DECKS_WITH_EN_IMAGES = new Set(['poslaniya'])
function cardImgFile(deckKey, cardId, locale) {
  return locale === 'en' && DECKS_WITH_EN_IMAGES.has(deckKey) ? `${cardId}-en.jpg` : `${cardId}.jpg`
}

// cyrb53 — a real string hash with proper bit-mixing/avalanche (public-domain,
// widely used for exactly this seeded-pseudorandom-pick use case). Replaces
// a naive `h = h*31 + charCode` rolling hash that had none: since `dateKey`
// only changes by 1-2 trailing characters day to day, the old hash barely
// moved either — picks drifted through each deck in a near-arithmetic
// sequence instead of anything resembling random (found + fixed the same
// bug in generate-video-pickcard.mjs's "Выбери карту" first, 2026-09-14,
// after Nick flagged two back-to-back days looking like the same card —
// this file shares the identical old hash and was never separately
// reported, but has the same defect). **Must stay byte-for-byte identical
// to `hashStr` in scripts/blog/lib.mjs** — that file's `pickCard()` mirrors
// this one's algorithm and seed on purpose so the blog's "карта дня"
// always matches this video's card; drifting the two apart breaks that.
function hashStr(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function addDaysToKey(dateKey, delta) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
// Display-only "what day is it really" — see generate-video-message-
// spread.mjs's identical helper for the full incident writeup. This
// pipeline's own cron comment already says "secondary, often very late"
// for its backup slot, which is exactly the risk window (GitHub lag
// pushing real execution past Moscow's 21:00 UTC midnight while the
// runner's own UTC clock hasn't rolled over yet) — kept separate from
// `dateKey` (file names / posted-marker tags, which must stay whatever
// the runner's plain UTC clock gives so generate+post steps agree).
function todayDisplayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function humanDate(dateKey, locale) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return locale === 'en' ? `${MONTHS_EN[m - 1]} ${d}, ${y}` : `${d} ${MONTHS_RU[m - 1]} ${y}`
}

// Trim to the last sentence boundary that fits `budget` chars (so a cut
// caption still ends cleanly, not mid-word).
function fitToSentences(text, budget) {
  if (text.length <= budget) return { text, cut: false }
  const sentences = text.split(/(?<=[.!?…»])\s+/)
  let out = ''
  for (const s of sentences) {
    if ((out + (out ? ' ' : '') + s).length > budget) break
    out = out + (out ? ' ' : '') + s
  }
  if (!out) out = text.slice(0, budget).replace(/\s+\S*$/, '')
  return { text: out.trim(), cut: true }
}

// Rerih is deliberately NOT in this pool — see generate-video-tarot.mjs's
// own header comment (2026-08-31, Nick's explicit permanent constraint on
// keeping that deck's real name out of the shared multi-deck stream, plus
// a real prior regression from folding it in here) for why. Rerih already
// gets its own separate daily "card of the day" via that script — it's not
// being left out of "card of the day" overall, just kept in its own stream
// on purpose. Don't add it to `DECKS` here without re-reading that note.
function drawDailyCard(dateKey, seedNs, deckPool, excludeKeys) {
  for (let i = 1; i < 50; i++) {
    const h = hashStr(`${dateKey}|${seedNs}|${i}`)
    const deck = deckPool[h % deckPool.length]
    const cardId = (h % deck.total) + (deck.startId ?? 1)
    const key = `${deck.key}-${cardId}`
    if (!excludeKeys?.has(key)) return { deckKey: deck.key, cardId }
  }
  // Unreachable in practice (200+ cards in the pool, at most
  // RECENT_AVOID_DAYS entries excluded) — fall back to the first attempt.
  const h = hashStr(`${dateKey}|${seedNs}|1`)
  const deck = deckPool[h % deckPool.length]
  return { deckKey: deck.key, cardId: (h % deck.total) + (deck.startId ?? 1) }
}

// How many days back the exact same card must not repeat — this is the
// single flagship daily format, so a slightly longer window than the
// secondary "Выбери карту" pipeline's 7 days.
const RECENT_AVOID_DAYS = 14
// This script runs as a fresh, stateless process once a day (no persisted
// history) — so "look back N days" can't just re-derive those N days from
// (target - N) on each call: a LATER call's own from-scratch reconstruction
// of an EARLIER day can disagree with what that earlier day's own real,
// independent run actually produced, since the two reconstructions start
// their "cold" (no-exclusion) point at different calendar days. That
// silently let real repeats through in an earlier version of this fix —
// caught by simulating hundreds of independent daily calls (a faithful
// stand-in for that many real separate CI runs), not by a smaller/shorter
// check. Walking forward from one FIXED, never-changing anchor instead —
// so any two calls, whatever their own target date, replay the exact same
// deterministic sequence and always agree on every shared day — closes
// this for good. Cheap even years out (a few ms of hashing, dwarfed by
// this script's own ffmpeg render time). **Must match
// `PICK_HISTORY_ANCHOR`/the walk in `pickCard()`, scripts/blog/lib.mjs,
// exactly** — see that function's own comment.
const PICK_HISTORY_ANCHOR = '2026-01-01'
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Same algorithm as src/lib/dailyCard.ts (modulo the anti-repeat window
// below, which that per-device app pick doesn't need — each user has their
// own independent seed already), but with a fixed public seed — this is
// the "card of the day" shown on social media, independent of any one
// user's own per-device daily card in the app. **Must produce identical
// results to `pickCard()` in scripts/blog/lib.mjs for the same dateKey** —
// see that function's own comment.
export function pickPublicDailyCard(dateKey, deckPool = DECKS) {
  const totalDays = Math.max(0, daysBetween(PICK_HISTORY_ANCHOR, dateKey))
  const window = [] // trailing RECENT_AVOID_DAYS days' picks, oldest first
  let picked
  for (let n = 0; n <= totalDays; n++) {
    const key = addDaysToKey(PICK_HISTORY_ANCHOR, n)
    const excludeKeys = new Set()
    for (const p of window) excludeKeys.add(`${p.deckKey}-${p.cardId}`)
    picked = drawDailyCard(key, 'public-social', deckPool, excludeKeys)
    window.push(picked)
    if (window.length > RECENT_AVOID_DAYS) window.shift()
  }
  return picked
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxCharsPerLine) {
      if (line) lines.push(line.trim())
      line = w
    } else {
      line = (line + ' ' + w).trim()
    }
  }
  if (line) lines.push(line.trim())
  return lines
}

function firstSentences(text, maxChars) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  let out = ''
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > maxChars) break
    out = (out + ' ' + s).trim()
  }
  return out || text.slice(0, maxChars)
}

const DECK_TITLES = {
  ru: { golos: 'Голос Господа', poslaniya: 'Послания Бога', probuzhdenie: 'Пробуждение Души' },
  en: { golos: 'Voice of God', poslaniya: 'Messages of God', probuzhdenie: 'Awakening of the Soul' },
}

const LABEL = { ru: 'КАРТА ДНЯ', en: 'CARD OF THE DAY' }
const WATERMARK = 'nikolablajen.ru'

// Instagram caption hard limit is 2200 chars — we aim a bit under.
const CAPTION_LIMIT = 2150

// TikTok's own description limit is ~2200 chars too (not the old, long-gone
// 300-char cap) — same ceiling as Instagram, not a shorter one. This used to
// just reuse CAPTION_LIMIT above, which is deliberately trimmed a bit under
// 2200 for Instagram's own margin — harmless there, but it meant TikTok's
// caption (built purely for Nick to copy/paste by hand — see
// buildTikTokCaption below) was trimmed to Instagram's budget for no reason,
// leaving real keyword-rich text on the table. Own constant so IG's margin
// doesn't leak into TikTok's budget.
const TIKTOK_CAPTION_LIMIT = 2200

// Pull a closing "…" / «…» quoted sentence off the end (the card's "phrase of
// the day") so it can be set on its own line.
function extractClosingQuote(text) {
  const m = text.match(/[«"“]([^«»"“”]{8,})[»"”]\s*$/)
  if (!m) return { body: text, quote: null }
  return { body: text.slice(0, m.index).trim(), quote: m[1].trim() }
}

// Repack a run-on card description into 2–3 LARGE paragraphs (Nick hates
// choppy little ones — same rule as the blog's paragraphs()). Honours
// existing blank-line breaks but always caps the count (~7 sentences each).
function toParagraphs(text, max = 3) {
  let parts = String(text).trim().split(/\n{2,}/).map((s) => s.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
  if (parts.length <= 1) {
    parts = (String(text).replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+(?:["»”])?|\S[^.!?…]*$/g) || [text])
      .map((s) => s.trim())
      .filter(Boolean)
  }
  // ~700 chars per paragraph, 1–max groups (length-based)
  const totalLen = String(text).replace(/\s+/g, ' ').trim().length
  const slots = Math.max(1, Math.min(max, Math.ceil(totalLen / 700)))
  const per = Math.ceil(parts.length / slots)
  const out = []
  for (let i = 0; i < parts.length; i += per) {
    out.push(parts.slice(i, i + per).join(' ').replace(/\s+/g, ' ').trim())
  }
  return out
}

// `article` (optional, RU) is the AI "esoteric-lecturer" section from
// prompts.mjs. `maxChars` caps the whole caption: ~2150 for Instagram,
// higher (~3500) for VK / YouTube, which have room and — per Nick's
// standing rule — should be filled, not hand-shortened.
function buildCaption({ locale, dateKey, deckKey, card, asmr, article = '', maxChars = CAPTION_LIMIT, headline = '' }) {
  const deckTitle = DECK_TITLES[locale][deckKey]
  const tags = pickHashtags(dateKey, locale, deckKey, 16)
  const asmrTag = asmr ? (locale === 'en' ? ' 🎧 ASMR version' : ' 🎧 ASMR-версия') : ''
  // The AI headline (viral, day-specific) now leads the caption too, not
  // just Telegram/YouTube — this is the FIRST ~125 chars Instagram shows
  // before "...more", i.e. the only text most scrollers ever actually
  // read. A flat "🔮 Card of the day · Sept 8" template here every single
  // day was real, measured content-conversion loss (found 2026-09-08
  // digging into why reach wasn't converting to profile visits) — falls
  // back to the old template on any day the headline generation fails.
  const header = headline
    ? (locale === 'en'
        ? `🔮 ${headline}${asmrTag}\n✨ “${card.title}” — “${deckTitle}” deck`
        : `🔮 ${headline}${asmrTag}\n✨ «${card.title}» — колода «${deckTitle}»`)
    : locale === 'en'
      ? `🔮 Card of the day · ${humanDate(dateKey, 'en')}${asmrTag}\n✨ “${card.title}” — “${deckTitle}” deck`
      : `🔮 Карта дня · ${humanDate(dateKey, 'ru')}${asmrTag}\n✨ «${card.title}» — колода «${deckTitle}»`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  const moreNote = locale === 'en'
    ? `\n📖 Full text — in the Nikola Blajen app.`
    : `\n📖 Полный текст — в приложении «Никола Блажен».`
  // The 2026-09-09 cross-promo line mentioning the paid /razbor/ reading
  // (added the same day the sales-funnel diagnosis ran) was removed again
  // the very next day — Nick, once his own cashflow pressure eased:
  // "деньги сейчас есть - можно выдохнуть от продаж... будем просто
  // бесплатный контент давать, ничего не продавать там... кто надо сам
  // зайдёт, а то не дай бог ютуб фильтр повесит на нас" (worried that any
  // promotional framing reads as a spam signal to the algorithm, on top
  // of just not wanting to sell right now). Daily card/Tarot stays pure
  // information — no service mention at all; `moreNote` below already
  // points to the free app, which is the only "next step" this format
  // offers now.
  const razborLine = ''

  const { body: rawBody, quote } = extractClosingQuote(card.description.trim())
  const quoteLine = quote ? (locale === 'en' ? `💬 “${quote}”` : `💬 «${quote}»`) : ''
  // Article carries its own **bold** markdown; plain-text channels (IG/VK)
  // don't render it, so strip the asterisks here.
  const articlePlain = article.trim().replace(/\*\*(.+?)\*\*/g, '$1')

  const fixedLen = header.length + footer.length + razborLine.length + tags.length + quoteLine.length + moreNote.length + 28
  const budget = maxChars - fixedLen

  const paras = toParagraphs(rawBody)
  if (articlePlain) paras.push(...articlePlain.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean))
  let body = ''
  let cut = false
  for (const p of paras) {
    if ((body + '\n\n' + p).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + p
  }
  if (!body) { body = fitToSentences(rawBody, budget).text; cut = true }

  return [
    header,
    '',
    body + (cut ? moreNote : ''),
    ...(quoteLine ? ['', quoteLine] : []),
    '',
    footer,
    ...(razborLine ? [razborLine] : []),
    '',
    tags,
  ].join('\n')
}

// TikTok caption — Nick's ask, 2026-09-01: TikTok drafts never carry a
// caption via the API at all (he pastes it in by hand in the app), and he
// found the usual 16-hashtag block left too little room/felt hashtag-heavy
// once pasted into TikTok's own compose box. Same shape as buildCaption
// above, just 5 hashtags instead of 16 — freeing that budget back to real
// body text is the actual fix, not a separate/shorter body.
function buildTikTokCaption({ locale, dateKey, deckKey, card, asmr, headline = '' }) {
  const deckTitle = DECK_TITLES[locale][deckKey]
  const tags = pickHashtags(dateKey, locale, deckKey, 5)
  const asmrTag = asmr ? (locale === 'en' ? ' 🎧 ASMR version' : ' 🎧 ASMR-версия') : ''
  const header = headline
    ? (locale === 'en'
        ? `🔮 ${headline}${asmrTag}\n✨ “${card.title}” — “${deckTitle}” deck`
        : `🔮 ${headline}${asmrTag}\n✨ «${card.title}» — колода «${deckTitle}»`)
    : locale === 'en'
      ? `🔮 Card of the day · ${humanDate(dateKey, 'en')}${asmrTag}\n✨ “${card.title}” — “${deckTitle}” deck`
      : `🔮 Карта дня · ${humanDate(dateKey, 'ru')}${asmrTag}\n✨ «${card.title}» — колода «${deckTitle}»`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  const moreNote = locale === 'en'
    ? `\n📖 Full text — in the Nikola Blajen app.`
    : `\n📖 Полный текст — в приложении «Никола Блажен».`

  const { body: rawBody, quote } = extractClosingQuote(card.description.trim())
  const quoteLine = quote ? (locale === 'en' ? `💬 “${quote}”` : `💬 «${quote}»`) : ''

  const fixedLen = header.length + footer.length + tags.length + quoteLine.length + moreNote.length + 16
  const budget = TIKTOK_CAPTION_LIMIT - fixedLen

  const paras = toParagraphs(rawBody)
  let body = ''
  let cut = false
  for (const p of paras) {
    if ((body + '\n\n' + p).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + p
  }
  if (!body) { body = fitToSentences(rawBody, budget).text; cut = true }

  return [
    header,
    '',
    body + (cut ? moreNote : ''),
    ...(quoteLine ? ['', quoteLine] : []),
    '',
    footer,
    '',
    tags,
  ].join('\n')
}

// Telegram channel caption. Hard limit is 1024 chars, so the message is fit
// to whole paragraphs under a tighter budget and the permanent card page on
// the site carries the full read. HTML parse_mode (only <b> and <a> used).
const TG_LIMIT = 4000 // full article + AI section; Telegram message cap is 4096 (post-telegram.mjs sends it as a follow-up message when > 1024)
// `article` (optional) is the AI-written extra section from
// prompts.mjs/generateCardArticle — the card's archetype/image/how-to-live-
// with-it, ~1200-1600 chars on top of the base description. It carries its
// own **bold headers** (markdown) → convert to <b> for TG's HTML mode.
function buildTelegramCaption({ dateKey, deckKey, cardId, card, asmr, article = '', headline = '' }) {
  const deckTitle = DECK_TITLES.ru[deckKey]
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const boldToHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  const cardUrl = `https://nikolablajen.ru/blog/karta/${deckKey}/${cardId}/`
  // Header = the AI headline (viral, dated, unique), no emoji spam — this
  // line + the first body line are the Дзен card preview, they have to make
  // someone WANT to open it (Nick, 2026-09-04). A single 🎧 tag only when
  // it's actually the ASMR variant.
  const asmrTag = asmr ? ' · 🎧 ASMR' : ''
  const header = `<b>${esc(headline || `Карта дня, ${humanDate(dateKey, 'ru')} · «${card.title}»`)}${asmrTag}</b>\n«${esc(card.title)}» — колода «${esc(deckTitle)}»`
  // Both links live on ONE line deliberately — post-telegram.mjs's
  // buildMediaCaption() truncates the video caption to Telegram's 1024-char
  // cap and preserves exactly one "line containing <a " intact at the end,
  // everything else gets trimmed as ordinary body text. Putting the razbor
  // mention on its OWN line would leave it subject to that same trim (found
  // 2026-09-09 while adding it — a second, separate link line is not
  // reliably kept). This feeds Дзен, this project's actual top traffic
  // source (~65% of visits per the site-analytics section) — and it never
  // once mentioned a paid personal reading exists at all until now.
  const links = `Полное значение карты «${esc(card.title)}», все толкования и карта дня — <a href="${cardUrl}">на сайте</a>.`
  const tags = pickHashtags(dateKey, 'ru', deckKey, 6)
  const { body: rawBody, quote } = extractClosingQuote(card.description.trim())
  const quoteLine = quote ? `💬 «${esc(quote)}»` : ''
  const articleBlock = article.trim() ? boldToHtml(article.trim()) : ''

  const budget = TG_LIMIT - header.length - links.length - tags.length - quoteLine.length - articleBlock.length - 24
  const paras = toParagraphs(rawBody)
  let body = ''
  let cut = false
  for (const p of paras) {
    if ((body + '\n\n' + esc(p)).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + esc(p)
  }
  if (!body) { body = esc(fitToSentences(rawBody, budget).text); cut = true }
  if (cut) body += ' …'

  return [
    header,
    '',
    body,
    ...(articleBlock ? ['', articleBlock] : []),
    ...(quoteLine ? ['', quoteLine] : []),
    '',
    links,
    '',
    tags,
  ].join('\n')
}

// A handful of Ken Burns camera moves, rotated by day so the feed doesn't
// look like the same clip re-skinned every time. `expr(d)` gets the total
// frame count and returns the zoompan filter's z/x/y expressions.
const SCENARIOS = [
  {
    name: 'zoom-in',
    expr: () => ({ z: 'min(zoom+0.0006,1.15)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }),
  },
  {
    name: 'zoom-out',
    expr: () => ({ z: 'max(1.15-0.0006*on,1.0)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }),
  },
  {
    name: 'pan-left-right',
    expr: (d) => ({ z: '1.12', x: `(iw*zoom-iw)*on/${d}`, y: 'ih/2-(ih/zoom/2)' }),
  },
  {
    name: 'pan-top-bottom',
    expr: (d) => ({ z: '1.12', x: 'iw/2-(iw/zoom/2)', y: `(ih*zoom-ih)*on/${d}` }),
  },
]

function pickScenario(dateKey) {
  const h = hashStr(dateKey + '|scenario')
  return SCENARIOS[h % SCENARIOS.length]
}

async function loadCard(deckKey, cardId, locale) {
  const file = locale === 'en' ? `${deckKey}-en.json` : `${deckKey}.json`
  const data = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', file), 'utf8'))
  return data.find((c) => c.id === cardId)
}

// `voice`/`speed` overridable for the ASMR test variant (2026-09-01, Nick's
// ask: "озвучку делай — согласен!") — a slower, softer alternate narration
// of the exact same daily card, posted as its own additional video
// (--asmr flag below), not a replacement for the normal onyx narration.
async function synthesizeSpeech(text, outPath, { voice = 'onyx', speed = 1 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping narration, video will be silent.')
    return null
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      response_format: 'mp3',
      speed,
    }),
  })
  if (!res.ok) {
    console.warn('TTS request failed:', res.status, await res.text())
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  return outPath
}

// Re-transcribes our own narration with Whisper just to get word-level
// timestamps (the TTS endpoint itself doesn't return timing) — that's what
// lets the on-screen caption update in sync with the voice instead of
// sitting there as one static block for the whole clip.
async function getWordTimestamps(audioPath, locale) {
  const apiKey = process.env.OPENAI_API_KEY
  const buf = await readFile(audioPath)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'narration.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('language', locale === 'en' ? 'en' : 'ru')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    console.warn('Whisper transcription failed:', res.status, await res.text())
    return null
  }
  const data = await res.json()
  return data.words ?? null
}

// Groups timed words into ~4-word on-screen bursts, each carrying the
// start/end of its first/last word so it can be shown only while it's
// actually being spoken.
function chunkWords(words, wordsPerChunk = 4) {
  const chunks = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk)
    chunks.push({
      text: slice.map((w) => w.word.trim()).join(' '),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    })
  }
  return chunks
}

async function probeDurationSeconds(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  return parseFloat(stdout.trim())
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  // ASMR test variant — same card, same script, a slower/softer alternate
  // narration posted as its own additional video (Nick, 2026-09-01:
  // "озвучку делай — согласен! запускай"). Never replaces the normal onyx
  // narration; output files get an `asmr-` prefix on the suffix so they
  // never collide with the regular daily video and post-*.mjs's own
  // `--suffix=` convention picks them up as `asmr-ru`/`asmr-en`.
  const asmr = args.asmr === true || args.asmr === 'true'
  const suffix = asmr ? `asmr-${locale}` : locale
  // --date override: purely a seed for pickPublicDailyCard/output filenames,
  // not a claim about which real calendar day this is for — lets a one-off
  // batch render (e.g. Nick's TikTok stockpile) produce several distinct
  // videos without waiting for real days to pass. Never used by the actual
  // daily automation, which always wants real "today".
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()
  const displayDateKey = typeof args.date === 'string' ? args.date : todayDisplayKey()
  const { deckKey, cardId } = pickPublicDailyCard(dateKey)
  const card = await loadCard(deckKey, cardId, locale)
  if (!card) throw new Error(`card not found: ${deckKey}/${cardId} (${locale})`)

  const imagePath = path.join(ROOT, 'public', 'decks', deckKey, cardImgFile(deckKey, cardId, locale))
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })

  // ~350 chars lands around 20-30s of narration at onyx's speaking rate —
  // the main-gist teaser, not the full card (that goes in the caption).
  const teaser = firstSentences(card.description, 350)

  const fontDir = path.join(__dirname, 'fonts')
  const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
  const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

  // Fresh AI headline, generated BEFORE the render so it can drive the
  // on-screen overlay too, not just the YouTube title/Telegram header (the
  // only two places it was used before). Real gap found 2026-09-08 while
  // digging into why reach isn't converting: the retention data already
  // proved a day-specific hook beats a generic label (see "Digging into
  // weak-retention videos" — the best-performing video used exactly this
  // kind of headline), but the actual on-screen text people see in the
  // first frame was still the same static "КАРТА ДНЯ" + card name every
  // single day, on the single highest-volume stream in the whole pipeline.
  // Also generated for EN now, not just RU — it silently never ran for EN
  // before, always falling back to the flat template title.
  const ytDeckTitle_ = DECK_TITLES[locale][deckKey]
  const asmrYt_ = asmr ? ' 🎧 ASMR' : ''
  const cardHeadline = await generateHeadline({
    kind: 'card',
    subject: locale === 'en' ? `"${card.title}" — the "${ytDeckTitle_}" deck${asmrYt_}` : `«${card.title}» — колода «${ytDeckTitle_}»${asmrYt_}`,
    dateHuman: humanDate(displayDateKey, locale),
    locale,
  })

  // ASMR videos get a visible "· ASMR" tag on the on-screen label — without
  // it, the ASMR post looks like an accidental duplicate of the normal
  // daily card in a feed grid (same title, same cover, same caption look).
  // Caught live, 2026-09-01: Nick saw "Глубинное Счастье" twice on VK and
  // assumed the duplicate-post guard had failed; it hadn't — the guard
  // correctly blocked three separate re-post attempts that day (confirmed
  // via `wasPosted` log lines) — this was the ASMR feature intentionally
  // posting the same card a second time, just visually indistinguishable.
  const label = asmr ? `${LABEL[locale]} · ASMR` : LABEL[locale]
  // The headline is a full sentence-style hook (~40-85 chars per
  // generateHeadline's own target) rather than a short name — cap what
  // actually gets drawn on screen at ~66 chars (a clean word boundary) so
  // it reliably wraps to at most 3 lines at this wrap width and never
  // risks overflowing the fixed-height header box below. The full,
  // untruncated headline is still used everywhere else (YouTube title,
  // Telegram/Дзен header) — this trim is on-screen-overlay-only.
  const overlayHeadline = cardHeadline && cardHeadline.length > 66
    ? cardHeadline.slice(0, 66).replace(/\s+\S*$/, '')
    : cardHeadline
  const titleLines = overlayHeadline ? wrapText(overlayHeadline, 26) : wrapText(card.title.toUpperCase(), 20)
  const textFile = path.join(outDir, `overlay-${dateKey}-${suffix}.txt`)
  await writeFile(textFile, [label, '', ...titleLines].join('\n'), 'utf8')

  const narrationText = `${card.title}. ${teaser}`
  const audioPath = path.join(outDir, `narration-${dateKey}-${suffix}.mp3`)
  // ASMR: a warmer, breathier voice (shimmer) at a noticeably slower pace —
  // the whole point of the test, per Nick's ask. `sage` is the other
  // soft/low-energy option in the gpt-4o-mini-tts voice set; picked shimmer
  // for now since it reads calmer on longer sentences like these.
  const audioFile = await synthesizeSpeech(narrationText, audioPath, asmr ? { voice: 'shimmer', speed: 0.82 } : {})
  const audioDuration = audioFile ? await probeDurationSeconds(audioFile) : 0
  const words = audioFile ? await getWordTimestamps(audioFile, locale) : null

  const fps = 30
  const duration = Math.max(10, Math.ceil(audioDuration + 1.5))
  const scenario = pickScenario(dateKey)
  const { z, x, y } = scenario.expr(duration * fps)

  const filterParts = [
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
      `zoompan=z='${z}':x='${x}':y='${y}':d=${duration * fps}:s=1080x1920:fps=${fps}`,
    `drawbox=x=0:y=0:w=1080:h=420:color=black@0.45:t=fill`,
    `drawtext=fontfile=${boldFont}:textfile=${textFile}:fontcolor=0xE8D5A8:fontsize=54:` +
      `line_spacing=14:x=(w-text_w)/2:y=80:box=0`,
    `drawbox=x=0:y=1450:w=1080:h=470:color=black@0.55:t=fill`,
  ]

  if (words && words.length) {
    // Caption updates in ~4-word bursts synced to the voice, instead of one
    // static block sitting on screen for the whole clip.
    const chunks = chunkWords(words, 4)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const lines = wrapText(chunk.text, 26)
      const chunkFile = path.join(outDir, `caption-${dateKey}-${suffix}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=52:` +
          `line_spacing=14:x=(w-text_w)/2:y=1500:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else {
    // No word timings (narration failed/skipped) — fall back to one static
    // teaser block for the whole clip.
    const teaserLines = wrapText(teaser, 34)
    const teaserFile = path.join(outDir, `teaser-${dateKey}-${suffix}.txt`)
    await writeFile(teaserFile, teaserLines.join('\n'), 'utf8')
    filterParts.push(
      `drawtext=fontfile=${regularFont}:textfile=${teaserFile}:fontcolor=0xEDE5D4:fontsize=38:` +
        `line_spacing=12:x=(w-text_w)/2:y=1500:box=0`
    )
  }

  filterParts.push(
    `drawtext=fontfile=${regularFont}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=28:` +
      `x=(w-text_w)/2:y=h-60:box=0`
  )
  const filter = filterParts.join(',')

  const outVideo = path.join(outDir, `${dateKey}-${suffix}.mp4`)
  const ffmpegArgs = ['-y', '-loop', '1', '-i', imagePath]
  if (audioFile) ffmpegArgs.push('-i', audioFile)
  ffmpegArgs.push('-t', String(duration), '-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps))
  if (audioFile) {
    ffmpegArgs.push('-c:a', 'aac', '-shortest', '-map', '0:v', '-map', '1:a')
  }
  ffmpegArgs.push(outVideo)

  await run('ffmpeg', ffmpegArgs)

  // AI "esoteric-lecturer" article section (RU only for now — see
  // prompts.mjs). One generation, reused across TG / VK / IG. Дзен + FB +
  // IG all reward long, well-written text (Nick, 2026-09-03) — a thin post
  // is a wasted impression. Generated at the Telegram size (biggest room);
  // VK/IG captions trim it to their own caps in buildCaption.
  const cardArticle = locale === 'ru'
    ? await generateCardArticle(card, 'ru', TG_LIMIT - card.description.length - 500)
    : ''

  // cardHeadline itself is now generated earlier (before the render, so the
  // on-screen overlay can use it too — see that comment for the full
  // reasoning) and used for YouTube AND the Telegram/Дзен post header
  // (Nick, 2026-09-04: "заголовки в ТГ УЖАС, одно и то же — делай
  // виральные как на ютубе"). Now generated for EN too, not RU-only.
  const [, mmH, ddH] = dateKey.split('-')
  const fallbackYtTitle = locale === 'en'
    ? `Card of the day, ${ddH}.${mmH} · “${card.title}” — ${ytDeckTitle_}${asmrYt_}`
    : `Карта дня, ${ddH}.${mmH} · «${card.title}» — ${ytDeckTitle_}${asmrYt_}`

  // ASMR posts carry the exact same caption/hashtags — same card, just a
  // second narration style — so these don't need an asmr-aware variant.
  // .caption.txt: VK + YouTube (room to spare, fill it). .caption-ig.txt:
  // Instagram's 2200 cap. .tiktok.txt: hand-pasted, kept short.
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.caption.txt`),
    buildCaption({ locale, dateKey: displayDateKey, deckKey, card, asmr, article: cardArticle, maxChars: 3500, headline: cardHeadline }),
    'utf8'
  )
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.caption-ig.txt`),
    buildCaption({ locale, dateKey: displayDateKey, deckKey, card, asmr, article: cardArticle, maxChars: 2150, headline: cardHeadline }),
    'utf8'
  )
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.tiktok.txt`),
    buildTikTokCaption({ locale, dateKey: displayDateKey, deckKey, card, asmr, headline: cardHeadline }),
    'utf8'
  )
  if (locale === 'ru') {
    await writeFile(
      path.join(outDir, `${dateKey}-${suffix}.telegram.txt`),
      buildTelegramCaption({ dateKey: displayDateKey, deckKey, cardId, card, asmr, article: cardArticle, headline: cardHeadline || fallbackYtTitle }),
      'utf8'
    )
  }
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.meta.json`),
    JSON.stringify({
      dateKey, locale, deckKey, cardId, title: card.title, deckTitle: ytDeckTitle_, asmr,
      youtubeTitle: `${cardHeadline || fallbackYtTitle} #Shorts`,
      headline: cardHeadline || fallbackYtTitle,
      moreUrl: `https://nikolablajen.ru/blog/${locale === 'en' ? 'en/' : ''}karta/${deckKey}/${cardId}/`,
    }),
    'utf8'
  )
  console.log(JSON.stringify({ video: outVideo, deckKey, cardId, locale, asmr, scenario: scenario.name, narrated: Boolean(audioFile), duration }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
