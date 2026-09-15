// Renders "Выбери карту" / "Pick a card" — a second, additional daily
// video, separate from the main "card of the day": three cards revealed
// one by one, each with a short teaser, closing with a CTA to comment
// which one the viewer picked. Nick's ask, 2026-09-01: "как еще одна доп
// карта на все каналы рус и анг версию. В тг тоже! везде куда можно пости.
// раз в день и запускай." — additive to the main daily card, not a
// replacement, full RU+EN, every channel including Telegram.
//
// Same 3-deck pool as the main daily card (golos/poslaniya/probuzhdenie),
// a seed independent of pickPublicDailyCard (generate-video.mjs) so the
// three cards here don't have to relate to that day's main card at all.
//
// Built as several short single-image segments (intro / card 1 / card 2 /
// card 3 / outro), each rendered exactly like the main pipeline's single
// card video (Ken Burns + drawtext + its own narration), then concatenated
// with ffmpeg's concat demuxer — much simpler and more robust than one
// giant multi-input filtergraph, and reuses the same per-segment recipe
// four times over instead of inventing a new one.
//
// Usage: node scripts/social/generate-video-pickcard.mjs [--locale=ru|en] [--out=dir] [--date=YYYY-MM-DD]
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickHashtags } from './hashtags.mjs'
import { COLLECTIONS } from '../blog/collections.mjs'
import { generateHeadline } from './prompts.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const DECKS = [
  { key: 'golos', total: 69 },
  { key: 'poslaniya', total: 80 },
  { key: 'probuzhdenie', total: 54 },
]
// The untethered daily draw and themed picks (relationship, etc.) draw from
// all 4 decks including Rerih — Nick, 2026-09-05: "из всех 4 колод делать,
// рандомно. так будет веселей" (originally about themes only), extended
// 2026-09-14 to the plain daily "Выбери карту" too: Nick noticed the same
// card recurring day to day and pointed out Rerih never got a turn at all
// — "у нас 4 колоды - и все могут и должны участвовать". Only "МАК" stays
// on the 3-deck-only `DECKS` pool (real Tarot doesn't fit that framing, see
// `pickThreeCards` below). The 3 original oracle decks' ids start at 1;
// Rerih's start at 0 (major arcana 0-21, minor 22-77) — startId defaults to
// 1 below where unset.
const ALL_DECKS = [...DECKS, { key: 'rerih', total: 78, startId: 0 }]
const DECKS_WITH_EN_IMAGES = new Set(['poslaniya'])
function cardImgFile(deckKey, cardId, locale) {
  return locale === 'en' && DECKS_WITH_EN_IMAGES.has(deckKey) ? `${cardId}-en.jpg` : `${cardId}.jpg`
}

// cyrb53 — a real string hash with proper bit-mixing/avalanche (public-domain,
// widely used for exactly this seeded-pseudorandom-pick use case). Replaces
// a naive `h = h*31 + charCode` rolling hash that had none: since a dateKey
// only changes by 1-2 trailing characters day to day ("2026-09-13" →
// "2026-09-14"), the old hash's output barely changed either — verified by
// simulating a month of picks, which came out as a near-arithmetic drift
// through each deck (e.g. probuzhdenie's card id ticking down by exactly 15
// every day) instead of anything resembling random. That drift is the real
// cause of Nick's "за пару дней выбралась одна и та же карта" report — cards
// visually barely varied day to day, not that the exact same card literally
// repeated, but close enough on adjacent days to read as "the same card".
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
// spread.mjs's identical helper for the full incident writeup (real bug,
// 2026-09-09/10: the weekly themed runs — relationship-pickcard-post.yml,
// mak-pickcard-post.yml, both cron '0 20 * * X' — fire late enough in UTC,
// plus GitHub's own routine scheduling lag, that the on-screen/caption
// date read a full day stale for real viewers by publish time). Kept
// separate from `dateKey` (file names / posted-marker tags — those must
// stay whatever the runner's own UTC clock gives, so generate+post steps
// agree with each other within one job run).
function todayDisplayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function humanDate(dateKey, locale) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return locale === 'en' ? `${MONTHS_EN[m - 1]} ${d}, ${y}` : `${d} ${MONTHS_RU[m - 1]} ${y}`
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
  const sentences = String(text).split(/(?<=[.!?])\s+/)
  let out = ''
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > maxChars) break
    out = (out + ' ' + s).trim()
  }
  return out || String(text).slice(0, maxChars)
}

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

const DECK_TITLES = {
  ru: { golos: 'Голос Господа', poslaniya: 'Послания Бога', probuzhdenie: 'Пробуждение Души', rerih: 'Карты Рёрига' },
  en: { golos: 'Voice of God', poslaniya: 'Messages of God', probuzhdenie: 'Awakening of the Soul', rerih: 'Röhrig Tarot' },
}

const WATERMARK = 'nikolablajen.ru'
const CAPTION_LIMIT = 2150

// One-per-deck draw (each of the 3 cards comes from a different deck, for
// visual variety within one video) from whichever `deckPool` is passed in.
// `seedNs` namespaces the hash so different callers (the untethered default
// draw, the MAK theme) don't land on the exact same 3 cards every day just
// because they share a dateKey.
function drawFromDecks(dateKey, seedNs, deckPool, excludeKeys) {
  const usedDecks = new Set()
  const picks = []
  const seen = new Set()
  for (let i = 1; picks.length < 3 && i < 200; i++) {
    const h = hashStr(`${dateKey}|${seedNs}|${i}`)
    const deck = deckPool[h % deckPool.length]
    if (usedDecks.has(deck.key)) continue
    const cardId = (h % deck.total) + (deck.startId ?? 1)
    const key = `${deck.key}-${cardId}`
    if (seen.has(key) || excludeKeys?.has(key)) continue
    seen.add(key)
    usedDecks.add(deck.key)
    picks.push({ deckKey: deck.key, cardId })
  }
  return picks
}

// How many days back a card must NOT have appeared again (per `seedNs`
// stream). Nick, 2026-09-14, screenshotting two back-to-back "Выбери карту"
// days that looked like the same card: even a properly-random hash still
// lets a small pool (3-4 decks) throw up a real repeat within a few days by
// pure chance (verified by simulation) — this is the explicit guard against
// that, on top of the hash fix above.
const RECENT_AVOID_DAYS = 7
// This script runs as a fresh, stateless process once a day (no persisted
// history) — so "look back N days" can't just re-derive those N days from
// (target - N) on each call: a LATER call's own from-scratch reconstruction
// of an EARLIER day can disagree with what that earlier day's own real,
// independent run actually produced, since the two reconstructions start
// their "cold" (no-exclusion) point at different calendar days. That
// silently let real repeats through — caught by simulating 400 independent
// daily calls (a faithful stand-in for 400 real separate CI runs), not by
// the smaller/shorter check that shipped first. Walking forward from one
// FIXED, never-changing anchor instead — so any two calls, whatever their
// own target date, replay the exact same deterministic sequence and always
// agree on every shared day — closes this for good. Cheap even years out
// (a few ms of hashing, dwarfed by this script's own ffmpeg render time).
const PICK_HISTORY_ANCHOR = '2026-01-01'
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}
function pickThreeFromDecks(dateKey, seedNs, deckPool = ALL_DECKS) {
  const totalDays = Math.max(0, daysBetween(PICK_HISTORY_ANCHOR, dateKey))
  const window = [] // trailing RECENT_AVOID_DAYS days' picks, oldest first
  let picks
  for (let n = 0; n <= totalDays; n++) {
    const key = addDaysToKey(PICK_HISTORY_ANCHOR, n)
    const excludeKeys = new Set()
    for (const dayPicks of window) for (const p of dayPicks) excludeKeys.add(`${p.deckKey}-${p.cardId}`)
    picks = drawFromDecks(key, seedNs, deckPool, excludeKeys)
    window.push(picks)
    if (window.length > RECENT_AVOID_DAYS) window.shift()
  }
  return picks
}

// Independent of pickPublicDailyCard's own seed — these three cards have no
// relationship to that day's main "card of the day". Only "МАК" stays
// scoped to the 3 original oracle decks (`DECKS`, no Rerih — real Tarot
// doesn't fit that self-reflection framing); the plain untethered draw uses
// all 4 (`ALL_DECKS`, see its own comment above for why this changed).
function pickThreeCards(dateKey, theme) {
  if (theme === 'mak') return pickThreeFromDecks(dateKey, 'pickcard-mak', DECKS)
  if (theme) return pickThreeThemedCards(dateKey, theme)
  return pickThreeFromDecks(dateKey, 'pickcard', ALL_DECKS)
}

// Themed variant (2026-09-05, "Building now" per BACKLOG.md — relationship-
// themed readings, Studio's top-flagged retention format). Reuses the same
// keyword-match pool as the site's /blog/podborka/karty-na-lyubov/ theme
// collection instead of a fresh keyword list, so the two stay in sync.
// Matches against the RU description regardless of output locale — the RU
// and EN card sets are the same cards under the same ids, just translated,
// so a RU keyword match picks the right card either way.
const THEME_KEYWORDS = {
  relationship: COLLECTIONS.find((c) => c.slug === 'karty-na-lyubov').kw,
}

function pickThreeThemedCards(dateKey, theme) {
  const kw = THEME_KEYWORDS[theme]
  if (!kw) throw new Error(`unknown theme: ${theme}`)
  // One flat pool across all 4 decks (Nick, 2026-09-05: "из всех 4 колод
  // делать, рандомно. так будет веселей" — explicitly reversing the
  // earlier one-per-deck guarantee in favor of genuine randomness,
  // repeats of a deck included, plus adding Rerih to the mix).
  const pool = []
  for (const deck of ALL_DECKS) {
    const data = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', `${deck.key}.json`), 'utf8'))
    for (const c of data) {
      if (kw.some((k) => c.description.toLowerCase().includes(k))) pool.push({ deckKey: deck.key, cardId: c.id })
    }
  }
  if (pool.length < 3) throw new Error(`theme "${theme}" pool too small (${pool.length} cards) — check its keywords`)
  const picks = []
  const seen = new Set()
  for (let i = 1; picks.length < 3 && i < 200; i++) {
    const h = hashStr(`${dateKey}|pickcard|${theme}|${i}`)
    const pick = pool[h % pool.length]
    const key = `${pick.deckKey}-${pick.cardId}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(pick)
  }
  return picks
}

async function loadCard(deckKey, cardId, locale) {
  const file = locale === 'en' ? `${deckKey}-en.json` : `${deckKey}.json`
  const data = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', file), 'utf8'))
  return data.find((c) => c.id === cardId)
}

async function synthesizeSpeech(text, outPath) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping narration, segment will be silent.')
    return null
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: text, response_format: 'mp3' }),
  })
  if (!res.ok) {
    console.warn('TTS request failed:', res.status, await res.text())
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  return outPath
}

async function probeDurationSeconds(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ])
  return parseFloat(stdout.trim())
}

// Re-transcribes our own narration with Whisper for word-level timestamps
// (same trick as generate-video.mjs) so the on-screen caption updates in
// sync with the voice in short bursts, instead of one static block — a
// static block is what overflowed its box on the first render of this
// script (a full teaser sentence just doesn't fit in a fixed-height area).
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

// One still gradient frame (brand dark→plum, same palette as the horoscope
// cover in write-daily-horoscope.mjs) — used as the "image" for the outro
// segment, which has no card art of its own.
async function makeGradientFrame(outPath) {
  await run('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=1080x1920:c0=0x0a0a16:c1=0x1c1730:x0=540:y0=300:x1=540:y1=1920',
    '-frames:v', '1', outPath,
  ])
}

// The intro used to be this same bare gradient while the narration said
// "three cards in front of you" — Nick caught it live: "ты говоришь в
// аудио перед тобой три карты — но их нет, только через несколько секунд
// оно появляется". Fixed by compositing all three card thumbnails (numbered
// 1/2/3) onto the gradient up front, so the claim in the narration matches
// what's on screen from frame one.
async function makeIntroCollage(outPath, gradientPath, cardImagePaths) {
  // Cards used to be tiny (300px wide, ~525px tall) sitting in the middle
  // of a mostly-empty 1090px-tall safe zone (between the header box ending
  // at y=360 and the caption box starting at y=1450) — Nick, live: "мелкие
  // не весь экран закрывают - а надо бы чтобы побольше было". Now sized to
  // fill most of that zone, overlapping like a fanned hand of cards (the
  // only way 3 cards this size fit across a 1080px-wide frame) — card 2
  // overlaps card 1's right edge, card 3 overlaps card 2's, drawn in that
  // order so each later card sits on top. Numbers stay centered on each
  // card's own center, which the overlap never reaches (it only eats the
  // outer/trailing ~210px of cards 1 and 2).
  const thumbW = 480
  const thumbH = Math.round((thumbW * 900) / 514) // real card art is ~514:900
  const centers = [270, 540, 810]
  const xs = centers.map((c) => c - thumbW / 2)
  const thumbY = 360 + Math.round((1090 - thumbH) / 2)
  // A plain number drawn straight onto the card art turned out to land
  // right on top of some decks' own printed card-number badge (e.g. a
  // Голос Господа card's "13" roman-numeral emblem sits in almost the
  // same spot my "3" did) — unreadable overlap, found rendering a real
  // test frame. Fixed with a solid gold badge (box, not just a shadow)
  // behind every number so it's legible against ANY card art underneath,
  // not just the ones tested by eye.
  const badgeSize = 76
  const numberY = thumbY - badgeSize / 2 + 8
  const badgeParts = []
  const textParts = []
  for (let i = 0; i < 3; i++) {
    const bx = Math.round(centers[i] - badgeSize / 2)
    badgeParts.push(`drawbox=x=${bx}:y=${Math.round(numberY)}:w=${badgeSize}:h=${badgeSize}:color=0xC9A96E@0.95:t=fill`)
    textParts.push(
      `drawtext=fontfile=${boldFont}:text='${i + 1}':fontsize=48:fontcolor=0x07070F:` +
        `x=${centers[i]}-text_w/2:y=${Math.round(numberY)}+(${badgeSize}-text_h)/2`
    )
  }
  const filterComplex = [
    `[1:v]scale=${thumbW}:-1[c1]`,
    `[2:v]scale=${thumbW}:-1[c2]`,
    `[3:v]scale=${thumbW}:-1[c3]`,
    `[0:v][c1]overlay=${xs[0]}:${thumbY}[bg1]`,
    `[bg1][c2]overlay=${xs[1]}:${thumbY}[bg2]`,
    `[bg2][c3]overlay=${xs[2]}:${thumbY}[bg3]`,
    `[bg3]${badgeParts.join(',')}[boxed]`,
    `[boxed]${textParts.join(',')}`,
  ].join(';')
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'gradients=s=1080x1920:c0=0x0a0a16:c1=0x1c1730:x0=540:y0=300:x1=540:y1=1920',
    '-i', cardImagePaths[0], '-i', cardImagePaths[1], '-i', cardImagePaths[2],
    '-filter_complex', filterComplex,
    '-frames:v', '1', outPath,
  ])
}

const SCENARIOS = [
  { name: 'zoom-in', expr: () => ({ z: 'min(zoom+0.0006,1.15)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'zoom-out', expr: () => ({ z: 'max(1.15-0.0006*on,1.0)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-left-right', expr: (d) => ({ z: '1.12', x: `(iw*zoom-iw)*on/${d}`, y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-top-bottom', expr: (d) => ({ z: '1.12', x: 'iw/2-(iw/zoom/2)', y: `(ih*zoom-ih)*on/${d}` }) },
]
function pickScenario(seedStr) {
  return SCENARIOS[hashStr(seedStr) % SCENARIOS.length]
}

const fontDir = path.join(__dirname, 'fonts')
const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

// Renders one segment (still image + Ken Burns + a short big header line +
// word-synced caption bursts + its own narration) to its own short mp4.
// Every segment always carries an audio stream — real narration, or a
// silent track of the same duration when narration failed/was skipped —
// so segments concat cleanly with `-c copy` regardless.
async function renderSegment({ outDir, tag, imagePath, narrationText, locale, headerLines, fallbackCaptionLines, scenarioSeed, static: staticFrame }) {
  const audioPath = path.join(outDir, `pc-audio-${tag}.mp3`)
  const narrated = narrationText ? await synthesizeSpeech(narrationText, audioPath) : null
  let audioFile = narrated
  let audioDuration = narrated ? await probeDurationSeconds(narrated) : 0
  const words = narrated ? await getWordTimestamps(narrated, locale) : null
  if (!audioFile) {
    audioDuration = Math.max(3, Math.ceil(String(narrationText || '').length / 14))
    audioFile = path.join(outDir, `pc-silence-${tag}.mp3`)
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', String(audioDuration), '-q:a', '9', audioFile])
  }
  const duration = Math.max(3, Math.ceil(audioDuration + 0.8))
  const fps = 30

  // The intro collage (all 3 cards + numbers) visibly jittered under Ken
  // Burns — zoompan's frame-by-frame rounding shows up as a wobble on
  // fine, high-contrast detail like thin card borders and small numerals.
  // Nick caught it: "сделай так чтобы где три карты они не тряслись".
  // Simplest fix: no zoompan on that frame, hold it still — it's on
  // screen only a few seconds anyway.
  let filterParts
  if (staticFrame) {
    filterParts = [`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`]
  } else {
    const scenario = pickScenario(scenarioSeed)
    const { z, x, y } = scenario.expr(duration * fps)
    filterParts = [
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `zoompan=z='${z}':x='${x}':y='${y}':d=${duration * fps}:s=1080x1920:fps=${fps}`,
    ]
  }
  if (headerLines && headerLines.length) {
    const headerFile = path.join(outDir, `pc-header-${tag}.txt`)
    await writeFile(headerFile, headerLines.join('\n'), 'utf8')
    filterParts.push(`drawbox=x=0:y=0:w=1080:h=360:color=black@0.45:t=fill`)
    filterParts.push(
      `drawtext=fontfile=${boldFont}:textfile=${headerFile}:fontcolor=0xE8D5A8:fontsize=64:` +
        `line_spacing=16:x=(w-text_w)/2:y=140:box=0`
    )
  }
  filterParts.push(`drawbox=x=0:y=1450:w=1080:h=470:color=black@0.55:t=fill`)
  if (words && words.length) {
    const chunks = chunkWords(words, 4)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const lines = wrapText(chunk.text, 26)
      const chunkFile = path.join(outDir, `pc-cap-${tag}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=52:` +
          `line_spacing=14:x=(w-text_w)/2:y=1500:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else if (fallbackCaptionLines && fallbackCaptionLines.length) {
    // No word timings (narration failed/skipped) — one short static block.
    const capFile = path.join(outDir, `pc-caption-${tag}.txt`)
    await writeFile(capFile, fallbackCaptionLines.join('\n'), 'utf8')
    filterParts.push(
      `drawtext=fontfile=${regularFont}:textfile=${capFile}:fontcolor=0xEDE5D4:fontsize=46:` +
        `line_spacing=14:x=(w-text_w)/2:y=1500:box=0`
    )
  }
  filterParts.push(
    `drawtext=fontfile=${regularFont}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=26:x=(w-text_w)/2:y=h-50:box=0`
  )
  const filter = filterParts.join(',')

  const outVideo = path.join(outDir, `pc-seg-${tag}.mp4`)
  await run('ffmpeg', [
    '-y', '-loop', '1', '-i', imagePath, '-i', audioFile,
    '-t', String(duration), '-vf', filter,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-shortest', '-map', '0:v', '-map', '1:a',
    outVideo,
  ])
  return { path: outVideo, duration }
}

async function concatSegments(segmentPaths, outVideo, outDir) {
  const listFile = path.join(outDir, `pc-concat-${Date.now()}.txt`)
  await writeFile(listFile, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outVideo])
  await unlink(listFile).catch(() => {})
}

// No emoji in any of these — they get drawn with PTSerif via ffmpeg
// drawtext, which has no emoji glyphs and renders a missing-glyph box
// instead (caught on the first test render). Emoji stay in the
// caption/hashtag text files, which social apps render fine on their own.
// Intro hook variants, rotated by day (Nick, 2026-09-07: "Выбери карту"
// was the one daily format still opening on the literal same label +
// narration every single day, forever — "выбери" flagged as a weak
// retention performer, "может заголовки другие тестировать - рандомные -
// и чтобы цепляло лучше". Same day-seeded rotation pattern already used
// for the Ken Burns camera move (pickScenario below) — deterministic per
// date, not random-random, so a given day's video is reproducible if
// re-rendered. Only the untethered (non-themed) daily format rotates for
// now; relationship/MAK stay single-variant, lower volume, not flagged.
const INTRO_VARIANTS = {
  ru: [
    { label: 'ВЫБЕРИ КАРТУ', introFallback: ['Мысленно выбери число:', '1, 2 или 3'], introNarration: 'Перед тобой три карты. Не выбирай глазами — почувствуй, какая из них первой откликнулась внутри. Раз, два или три?' },
    { label: 'ОДНА ИЗ ТРЁХ', introFallback: ['Одна карта уже знает ответ.', 'Выбери: 1, 2 или 3'], introNarration: 'Одна из этих трёх карт уже знает ответ на твой вопрос. Не думай — просто почувствуй, какая. Раз, два или три?' },
    { label: 'НЕ ЛИСТАЙ', introFallback: ['Сначала выбери число,', 'потом читай: 1, 2 или 3'], introNarration: 'Не листай дальше и не читай подписи — сначала выбери. Одна из трёх карт откликнется первой. Раз, два или три?' },
  ],
  en: [
    { label: 'PICK A CARD', introFallback: ['Pick a number in your head:', '1, 2 or 3'], introNarration: "Three cards in front of you. Don't choose with your eyes — feel which one pulled you first. One, two, or three?" },
    { label: 'ONE OF THREE', introFallback: ['One card already knows.', 'Pick: 1, 2 or 3'], introNarration: 'One of these three cards already knows your answer. Don\'t think — just feel which one. One, two, or three?' },
    { label: "DON'T SCROLL", introFallback: ['Pick your number first,', 'then read: 1, 2 or 3'], introNarration: "Don't scroll past, don't read ahead — pick first. One of these three cards will pull you in. One, two, or three?" },
  ],
}
function pickIntroVariant(locale, dateKey) {
  const list = INTRO_VARIANTS[locale]
  return list[hashStr(`${dateKey}|pc-intro-variant`) % list.length]
}

const COPY = {
  ru: {
    cardHeader: (n) => `КАРТА ${n}`,
    cardNarration: (n, title, teaser) => `Карта номер ${n === 1 ? 'один' : n === 2 ? 'два' : 'три'}. «${title}». ${teaser}`,
    outroHeader: 'ВЫБРАЛ?',
    outroFallback: ['Напиши в комментариях,', 'какую карту выбрал(а)'],
    outroNarration: 'Напиши в комментариях, какую карту выбрал — и что она про тебя сказала. Больше карт и толкований — в приложении «Никола Блажен».',
  },
  en: {
    cardHeader: (n) => `CARD ${n}`,
    cardNarration: (n, title, teaser) => `Card number ${n === 1 ? 'one' : n === 2 ? 'two' : 'three'}. "${title}". ${teaser}`,
    outroHeader: 'GOT ONE?',
    outroFallback: ['Comment which card', 'you picked'],
    outroNarration: 'Comment which card you picked — and what it said about you. More cards and readings in the Nikola Blajen app.',
  },
}

// Theme-specific overrides layered onto COPY[locale] (shallow merge) — only
// the intro/outro framing changes; cardHeader/cardNarration stay generic
// since the card itself already speaks to the theme (that's the point of
// picking from the themed pool).
const THEME_COPY = {
  relationship: {
    ru: {
      label: 'РАСКЛАД НА ОТНОШЕНИЯ',
      introFallback: ['Мысленно выбери число:', '1, 2 или 3'],
      introNarration: 'Расклад на отношения. Три карты перед тобой. Не выбирай глазами — почувствуй, какая из них первой откликнулась, когда ты подумал(а) о нём или о ней. Раз, два или три?',
      outroHeader: 'ВЫБРАЛ?',
      outroFallback: ['Напиши в комментариях,', 'какую карту выбрал(а)'],
      outroNarration: 'Напиши в комментариях, какую карту выбрал — и что она говорит про твои отношения. Больше карт и живой разбор — в приложении «Никола Блажен».',
    },
    en: {
      label: 'RELATIONSHIP SPREAD',
      introFallback: ['Pick a number in your head:', '1, 2 or 3'],
      introNarration: "A relationship spread. Three cards in front of you. Don't choose with your eyes — feel which one pulled you first when you thought of them. One, two, or three?",
      outroHeader: 'GOT ONE?',
      outroFallback: ['Comment which card', 'you picked'],
      outroNarration: 'Comment which card you picked — and what it says about your relationship. More cards and a living reading in the Nikola Blajen app.',
    },
  },
  // "МАК" (метафорические ассоциативные карты) deep-dive (2026-09-05,
  // BACKLOG.md "Building now"): the same 3 oracle decks as the untethered
  // draw (no Rerih — real Tarot doesn't fit this framing), explicitly
  // positioned as a psychology/self-reflection tool, never fortune-telling
  // — echoes "МАК карты" already in the rotating SEO keyword pool
  // (scripts/blog/keywords.mjs) so the video content and the page meta
  // reinforce the same query surface.
  mak: {
    ru: {
      label: 'МАК-ПРАКТИКА',
      introFallback: ['Мысленно выбери число:', '1, 2 или 3'],
      introNarration: 'Метафорические ассоциативные карты — не гадание, а способ увидеть то, что уже живёт внутри тебя. Три карты перед тобой. Не выбирай глазами — почувствуй, какая откликнулась первой. Раз, два или три?',
      outroHeader: 'ВЫБРАЛ?',
      outroFallback: ['Напиши в комментариях,', 'какую карту выбрал(а)'],
      outroNarration: 'Напиши в комментариях, какую карту выбрал — и что в ней узнал(а) про себя. Больше МАК-карт и живой разбор — в приложении «Никола Блажен».',
    },
    en: {
      label: 'MAK PRACTICE',
      introFallback: ['Pick a number in your head:', '1, 2 or 3'],
      introNarration: "Metaphoric associative cards — not fortune-telling, a way to see what's already living inside you. Three cards in front of you. Don't choose with your eyes — feel which one pulled you first. One, two, or three?",
      outroHeader: 'GOT ONE?',
      outroFallback: ['Comment which card', 'you picked'],
      outroNarration: 'Comment which card you picked — and what you recognized in yourself. More MAK cards and a living reading in the Nikola Blajen app.',
    },
  },
}

// Per-theme caption overrides — keyed once here instead of a ternary per
// theme per caption builder (that pattern stopped scaling at the 2nd
// theme). Add a new theme's caption wording here; leave a builder's
// fallback (below) as the untethered "Выбери карту" wording.
const CAPTION_THEME = {
  relationship: {
    ru: { social: '🔮 Расклад на отношения', socialSub: 'Три карты — три ответа про него/неё', intro: 'Подумай о нём/о ней секунду, потом выбери своё число (1, 2 или 3) — и читай свою карту ниже.' },
    en: { social: '🔮 Relationship spread', socialSub: 'Three cards, three answers about them', intro: 'Think of them for a second, then pick your number (1, 2 or 3) before you read your card below.' },
  },
  mak: {
    ru: { social: '🔮 МАК-практика', socialSub: 'Три карты — три ответа про себя', intro: 'Не гадание — способ увидеть, что уже живёт внутри. Выбери своё число (1, 2 или 3), потом читай свою карту ниже.' },
    en: { social: '🔮 MAK practice', socialSub: 'Three cards, three answers about yourself', intro: "Not fortune-telling — a way to see what's already inside you. Pick your number (1, 2 or 3), then read your card below." },
  },
}
const DEFAULT_CAPTION = {
  ru: { social: '🔮 Выбери карту', socialSub: 'Три карты — три ответа', intro: 'Не листай сразу — сначала выбери своё число (1, 2 или 3), потом читай свою карту ниже.' },
  en: { social: '🔮 Pick a card', socialSub: 'Three cards, three answers', intro: "Don't scroll past — pick your number first (1, 2 or 3), then read your card below." },
}
function captionCopy(theme, locale) {
  return CAPTION_THEME[theme]?.[locale] || DEFAULT_CAPTION[locale]
}

function buildCaption({ locale, dateKey, cards, theme }) {
  const tags = pickHashtags(`${dateKey}|pickcard${theme ? `|${theme}` : ''}`, locale, null, 16)
  const cc = captionCopy(theme, locale)
  const header = `${cc.social} · ${humanDate(dateKey, locale)}\n✨ ${cc.socialSub}`
  const intro = cc.intro
  const cardLines = cards.map((c, i) => {
    const n = i + 1
    const deckTitle = DECK_TITLES[locale][c.deckKey]
    return locale === 'en'
      ? `${n}️⃣ “${c.card.title}” — “${deckTitle}” deck`
      : `${n}️⃣ «${c.card.title}» — колода «${deckTitle}»`
  }).join('\n')
  const cta = locale === 'en'
    ? `💬 Comment your number — which card found you today?`
    : `💬 Напиши в комментариях своё число — какая карта нашла тебя сегодня?`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  return [header, '', intro, '', cardLines, '', cta, '', footer, '', tags].join('\n')
}

function buildTikTokCaption({ locale, dateKey, cards, theme }) {
  const tags = pickHashtags(`${dateKey}|pickcard${theme ? `|${theme}` : ''}`, locale, null, 5)
  const header = `${captionCopy(theme, locale).social} · ${humanDate(dateKey, locale)}`
  const cta = locale === 'en'
    ? `Comment your number (1, 2 or 3) — which card found you today?`
    : `Напиши своё число (1, 2 или 3) — какая карта нашла тебя сегодня?`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  return [header, '', cta, '', footer, '', tags].join('\n')
}

function buildTelegramCaption({ dateKey, cards, theme }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tags = pickHashtags(`${dateKey}|pickcard${theme ? `|${theme}` : ''}`, 'ru', null, 6)
  const cc = captionCopy(theme, 'ru')
  const header = `<b>${cc.social} · ${humanDate(dateKey, 'ru')}</b>\n✨ ${cc.socialSub}`
  const intro = cc.intro
  const cardLines = cards.map((c, i) => {
    const n = i + 1
    const deckTitle = DECK_TITLES.ru[c.deckKey]
    return `${n}️⃣ «${esc(c.card.title)}» — колода «${esc(deckTitle)}»`
  }).join('\n')
  const cta = '💬 Напиши в комментариях своё число — какая карта нашла тебя сегодня?'
  // One link, woven into a closing sentence.
  const links = `Все три карты с полными толкованиями, карта дня и живой разбор — <a href="https://nikolablajen.ru/">в приложении «Никола Блажен»</a>.`
  return [header, '', intro, '', cardLines, '', cta, '', links, '', tags].join('\n')
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const theme = typeof args.theme === 'string' ? args.theme : null
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()
  const displayDateKey = typeof args.date === 'string' ? args.date : todayDisplayKey()
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })
  const slug = theme ? `pickcard-${theme}` : 'pickcard'
  // Themed runs (relationship/mak) keep their own single fixed intro from
  // THEME_COPY; only the untethered daily "Выбери карту" rotates.
  const copy = { ...COPY[locale], ...(theme ? THEME_COPY[theme]?.[locale] : pickIntroVariant(locale, dateKey)) }

  // --cards=deckKey/id,deckKey/id,deckKey/id — explicit override so an EN
  // (or any re-)run can reproduce the EXACT same 3 cards another run
  // already picked/posted, instead of re-rolling (Nick, 2026-09-05: "сделай
  // его и на английском" about a specific already-posted RU relationship
  // post — a fresh random draw for EN would pick different cards).
  const picks = typeof args.cards === 'string'
    ? args.cards.split(',').map((s) => {
        const [deckKey, id] = s.trim().split('/')
        return { deckKey, cardId: Number(id) }
      })
    : pickThreeCards(dateKey, theme)
  const cards = []
  for (const p of picks) {
    const card = await loadCard(p.deckKey, p.cardId, locale)
    if (!card) throw new Error(`card not found: ${p.deckKey}/${p.cardId} (${locale})`)
    cards.push({ ...p, card })
  }

  const gradientPath = path.join(outDir, `pc-gradient-${dateKey}-${locale}.jpg`)
  await makeGradientFrame(gradientPath)
  const introPath = path.join(outDir, `pc-intro-collage-${dateKey}-${locale}.jpg`)
  await makeIntroCollage(introPath, gradientPath, cards.map((c) =>
    path.join(ROOT, 'public', 'decks', c.deckKey, cardImgFile(c.deckKey, c.cardId, locale))
  ))

  const segments = []
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-intro`, imagePath: introPath, locale,
    narrationText: copy.introNarration,
    headerLines: [copy.label], fallbackCaptionLines: copy.introFallback,
    scenarioSeed: `${dateKey}|pc-intro`, static: true,
  }))
  for (let i = 0; i < cards.length; i++) {
    const n = i + 1
    const { deckKey, cardId, card } = cards[i]
    const imagePath = path.join(ROOT, 'public', 'decks', deckKey, cardImgFile(deckKey, cardId, locale))
    const teaser = firstSentences(card.description, 220)
    const narrationText = copy.cardNarration(n, card.title, teaser)
    segments.push(await renderSegment({
      outDir, tag: `${dateKey}-${locale}-card${n}`, imagePath, locale,
      narrationText,
      headerLines: [copy.cardHeader(n)],
      fallbackCaptionLines: wrapText(card.title, 22),
      scenarioSeed: `${dateKey}|pc-card${n}`,
    }))
  }
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-outro`, imagePath: gradientPath, locale,
    narrationText: copy.outroNarration,
    headerLines: [copy.outroHeader], fallbackCaptionLines: copy.outroFallback,
    scenarioSeed: `${dateKey}|pc-outro`,
  }))

  const outVideo = path.join(outDir, `${dateKey}-${slug}-${locale}.mp4`)
  await concatSegments(segments.map((s) => s.path), outVideo, outDir)

  // Clean up intermediate per-segment files — only the final concatenated
  // video and the caption/meta sidecars matter to the post-*.mjs scripts.
  for (const s of segments) await unlink(s.path).catch(() => {})
  await unlink(gradientPath).catch(() => {})
  await unlink(introPath).catch(() => {})

  // File names keep the real `dateKey`; text shown to humans (captions,
  // fallback title, AI-headline context below) uses `displayDateKey`.
  const caption = buildCaption({ locale, dateKey: displayDateKey, cards, theme })
  await writeFile(path.join(outDir, `${dateKey}-${slug}-${locale}.caption.txt`), caption, 'utf8')
  await writeFile(
    path.join(outDir, `${dateKey}-${slug}-${locale}.tiktok.txt`),
    buildTikTokCaption({ locale, dateKey: displayDateKey, cards, theme }),
    'utf8'
  )
  if (locale === 'ru') {
    await writeFile(
      path.join(outDir, `${dateKey}-${slug}-ru.telegram.txt`),
      buildTelegramCaption({ dateKey: displayDateKey, cards, theme }),
      'utf8'
    )
  }
  const [, mmPick, ddPick] = displayDateKey.split('-')
  const fallbackPickTitle = locale === 'en'
    ? `${captionCopy(theme, 'en').social.replace('🔮 ', '')}, ${ddPick}.${mmPick} — 1, 2 or 3? #Shorts`
    : `${captionCopy(theme, 'ru').social.replace('🔮 ', '')}, ${ddPick}.${mmPick} — 1, 2 или 3? #Shorts`
  // Fresh AI headline per day (Nick, 2026-09-07: "может заголовки другие
  // тестировать - рандомные - и чтобы цепляло лучше" — "Выбери карту" had
  // the same fixed "1, 2 or 3?" template every single day, the one format
  // still not using the generateHeadline() system already proven to work
  // elsewhere — same pattern as the daily card format: RU only, EN keeps
  // the static template (no AI headline built for EN anywhere yet).
  const pickHeadline = locale === 'ru'
    ? await generateHeadline({
        kind: 'pickcard',
        subject: cards.map((c) => `«${c.card.title}»`).join(', '),
        dateHuman: humanDate(displayDateKey, 'ru'),
        locale: 'ru',
      })
    : ''
  await writeFile(
    path.join(outDir, `${dateKey}-${slug}-${locale}.meta.json`),
    JSON.stringify({
      dateKey, locale, cards: cards.map((c) => ({ deckKey: c.deckKey, cardId: c.cardId, title: c.card.title })),
      youtubeTitle: pickHeadline ? `${pickHeadline} #Shorts` : fallbackPickTitle,
      // No single card-page fits "3 cards at once" — link to the app itself
      // rather than building a broken /blog/karta/undefined/undefined/ URL
      // (see post-threads.mjs's threadsCaption, which reads this field).
      moreUrl: `https://nikolablajen.ru/${locale === 'en' ? 'en/' : ''}`,
    }),
    'utf8'
  )

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
  console.log(JSON.stringify({ video: outVideo, locale, cards: cards.map((c) => `${c.deckKey}/${c.cardId}`), duration: totalDuration }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
