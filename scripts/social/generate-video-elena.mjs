// Daily "card of the day" video introducing the /elena/ page — Nikola
// Blajen's own practicing tarot reader. Nick's ask, 2026-09-14: post once
// a day, RU only ("только русский, хоть она по английски говорит — но не
// надо"), informational rather than salesy ("не продающие — а просто
// рассказывающие о такой возможности аккуратно без продажи со ссылкой на
// неё"), with a card of the day as the hook.
//
// **v2, same day (2026-09-14).** v1 used the classic Rider-Waite-Smith deck
// (1909, genuinely public domain) specifically because it's widely
// recognized. TikTok removed the very first live post (the Devil card) for
// a Community Guidelines violation. Almost certainly the deck's adult
// nudity, not copyright — RWS really is public domain, and TikTok's
// removal notice never mentions rights/copyright, only their generic
// content-policy bucket, which nudity falls under; the flagged card was
// literally the one with two nude chained figures. Nick's own call:
// "странно что у них может авторские права нельзя публиковать... отключи
// пока... лучше моими Таро делай что пропускает без проблем" — stop using
// any external deck with a nudity-risk profile, rebuild on the in-house
// Rerih/Röhrig deck instead, which has none (every card checked — Major
// Arcana equivalents of Lovers/Devil/Star/Sun are fully clothed or have no
// figures at all) and has already been posting daily via
// generate-video-tarot.mjs for weeks with zero removals anywhere.
//
// The deck's real name is never said here — same permanent 2026-08-31
// constraint as generate-video-tarot.mjs (copyright-naming discipline for
// this specific deck; see that file's own header comment for the full
// reasoning). This script only ever says generic "Таро".
//
// Usage: node scripts/social/generate-video-elena.mjs [--out=dir] [--date=YYYY-MM-DD]
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickTarotHashtags } from './hashtags.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const TOTAL_CARDS = 78 // ids 0-77, same 0-indexed convention as every other Rerih call site

// cyrb53 — see generate-video-pickcard.mjs's own comment for the full
// incident writeup on why this isn't a naive `h*31+charCode` hash: that
// version barely moved from one day's dateKey to the next, producing a
// near-arithmetic drift through the deck instead of real randomness.
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
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Same walk-forward-from-a-fixed-anchor shape as generate-video.mjs/
// generate-video-pickcard.mjs (see either one's comment for the full
// incident writeup — a backward-from-target reconstruction let two
// independent daily calls silently disagree on shared history). Built
// correctly from the start here rather than repeating that mistake.
// Independent seed namespace ('elena-tarot') from generate-video-tarot.mjs's
// own daily pick ('public-tarot') — the two streams' cards don't need to
// (and mostly won't) match on a given day, same reasoning as pickcard's own
// independence from the main daily card.
const RECENT_AVOID_DAYS = 14
const PICK_HISTORY_ANCHOR = '2026-01-01'
// No EXCLUDED_CARD_IDS here — unlike the retired RWS version, every Major
// Arcana card in this deck was checked visually (2026-09-14, the cards
// equivalent to RWS's Lovers/Devil/Star/Sun — the four that carried RWS's
// nudity risk) and none show any nudity: Lovers-equivalent is a fully
// clothed embrace, Devil-equivalent is a fully suited figure, Star and Sun
// equivalents have no undressed figures at all (Sun has none at all). This
// deck has also been posting daily via generate-video-tarot.mjs for weeks
// with zero removals on any platform. If a future card art refresh ever
// changes this deck's art, re-check before assuming it's still safe.
function pickDailyCardId(dateKey) {
  const totalDays = Math.max(0, daysBetween(PICK_HISTORY_ANCHOR, dateKey))
  const window = []
  let picked
  for (let n = 0; n <= totalDays; n++) {
    const key = addDaysToKey(PICK_HISTORY_ANCHOR, n)
    const excludeIds = new Set(window)
    let id = null
    for (let i = 1; i < 50; i++) {
      const h = hashStr(`${key}|elena-tarot|${i}`)
      const candidate = h % TOTAL_CARDS
      if (excludeIds.has(candidate)) continue
      id = candidate
      break
    }
    if (id === null) id = hashStr(`${key}|elena-tarot|1`) % TOTAL_CARDS
    picked = id
    window.push(picked)
    if (window.length > RECENT_AVOID_DAYS) window.shift()
  }
  return picked
}

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
// Display-only "what day is it really" — see generate-video-message-
// spread.mjs's identical helper for the full incident writeup (kept
// separate from `dateKey`, which stays the runner's own UTC clock).
function todayDisplayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function humanDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${d} ${MONTHS_RU[m - 1]} ${y}`
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
function toParagraphs(text, max = 3) {
  let parts = String(text).trim().split(/\n{2,}/).map((s) => s.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
  if (parts.length <= 1) {
    parts = (String(text).replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+(?:["»”])?|\S[^.!?…]*$/g) || [text]).map((s) => s.trim()).filter(Boolean)
  }
  const totalLen = String(text).replace(/\s+/g, ' ').trim().length
  const slots = Math.max(1, Math.min(max, Math.ceil(totalLen / 700)))
  const per = Math.ceil(parts.length / slots)
  const out = []
  for (let i = 0; i < parts.length; i += per) out.push(parts.slice(i, i + per).join(' ').replace(/\s+/g, ' ').trim())
  return out
}
function stripBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}
function boldToHtml(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

const CAPTION_LIMIT = 2150
const TIKTOK_CAPTION_LIMIT = 2200
// Generic — never names the real deck (see header comment). Distinct
// wording from generate-video-tarot.mjs's own on-screen "КАРТА ДНЯ ТАРО"
// so the two streams don't look like literal duplicates in a feed.
const LABEL = 'ТАРО СЕГОДНЯ'
// The whole point of this stream — show the specific /elena/ link on
// screen, not just the generic homepage the other daily formats watermark.
const WATERMARK = 'nikolablajen.ru/elena'
const ELENA_URL = 'https://nikolablajen.ru/elena/'

// Deliberately gentle, informational voice — Nick's explicit instruction:
// "не продающие — а просто рассказывающие о такой возможности аккуратно
// без продажи". No price, no urgency, no imperative CTAs ("запишись
// сейчас"), no "гадание"/"предсказание" (standing project rule — see
// CONTENT-SAFETY.md), and never names the real deck (see header comment).
//
// The Elena mention is NOT part of this prompt on purpose — a first live
// test (2026-09-14) had the AI write its own closing Elena line AND the
// caption builders below append their own fixed `elenaLine`, so every post
// mentioned her twice, undermining the whole "one soft mention" point and
// reading pushier than intended. The AI note now stays 100% about the
// card; every caption builder's own single, hand-written `elenaLine` is
// the one and only place Elena is ever mentioned — consistent wording,
// a real link, and no risk of the model phrasing the pitch worse (or
// dropping it, or doubling it) on any given day.
const ELENA_NOTE_SYSTEM_PROMPT = (
  'Ты — тёплый, эрудированный рассказчик о картах Таро для соцсетей проекта «Никола Блажен». ' +
  'Пишешь про карту из классической колоды Таро — с уважением к её символике, без эзо-пафоса и без гадательных обещаний конкретных событий. Никогда не называй колоду по имени или автору — только «Таро»/«карта». ' +
  'СТРУКТУРА, без заголовков, просто два абзаца, между ними пустая строка: ' +
  '1) Что изображено на карте — образы, символы, детали композиции — и её главный традиционный смысл, живо и подробно, 5-6 развёрнутых предложений. ' +
  '2) Как это можно почувствовать сегодня — мягкое, подробное размышление, без «тебе нужно сделать», 4-5 развёрнутых предложений. ' +
  'Без восклицательных знаков и без превосходных степеней подряд, без «успей», «только сегодня», без цены цифрой. ' +
  'ЗАПРЕЩЕНО: «гадание», «предсказание», обещания конкретных событий/денег/встреч, канцелярит, «важно отметить», любое упоминание тарологов, консультаций или разборов — только про саму карту. ' +
  'ОБЪЁМ: 900-1200 символов суммарно — подробно, не сжато. Заканчивай точкой.'
)

export async function generateElenaCardNote(card, contextText) {
  const apiKey = process.env.OPENAI_API_KEY
  // Just a short static fallback — no Elena mention here either, same
  // reason as the system prompt's own comment: that's the caption
  // builders' job, exactly once, consistently worded.
  const fallback = firstSentences(contextText, 500)
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — falling back to the static card excerpt.')
    return fallback
  }
  const userPrompt = `Карта: «${card.title}».\nТрадиционное значение: ${contextText}\n\nНапиши сегодняшнюю заметку по этой карте.`
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: ELENA_NOTE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 1100,
      reasoning_effort: 'minimal',
    }),
  })
  if (!res.ok) {
    console.warn('Elena card-note generation failed:', res.status, await res.text())
    return fallback
  }
  const data = await res.json()
  const out = data?.choices?.[0]?.message?.content?.trim()
  return out || fallback
}

function buildCaption({ dateKey, card, noteText }) {
  const tags = pickTarotHashtags(`${dateKey}|elena`, 16, 'ru')
  const header = `🔮 ${LABEL} · ${humanDate(dateKey)}\n✨ «${card.title}»`
  const footer = `🕊 Никола Блажен`
  const elenaLine = `👁 Личный разбор с практикующим тарологом Еленой — по донату, без спешки: ${ELENA_URL}`

  const body = stripBold(noteText.trim())
  const fixedLen = header.length + footer.length + elenaLine.length + tags.length + 24
  const budget = CAPTION_LIMIT - fixedLen
  const paras = toParagraphs(body)
  let out = ''
  for (const p of paras) {
    if ((out + '\n\n' + p).length > budget) break
    out += (out ? '\n\n' : '') + p
  }
  if (!out) out = firstSentences(body, budget)

  return [header, '', out, '', elenaLine, '', footer, '', tags].join('\n')
}

function buildTikTokCaption({ dateKey, card, noteText }) {
  const tags = pickTarotHashtags(`${dateKey}|elena`, 5, 'ru')
  const header = `🔮 ${LABEL} · ${humanDate(dateKey)}\n✨ «${card.title}»`
  const elenaLine = `👁 Личный разбор с тарологом Еленой (по донату): ${ELENA_URL}`
  const body = stripBold(noteText.trim())
  const fixedLen = header.length + elenaLine.length + tags.length + 20
  const budget = TIKTOK_CAPTION_LIMIT - fixedLen
  const paras = toParagraphs(body)
  let out = ''
  for (const p of paras) {
    if ((out + '\n\n' + p).length > budget) break
    out += (out ? '\n\n' : '') + p
  }
  if (!out) out = firstSentences(body, budget)
  return [header, '', out, '', elenaLine, '', tags].join('\n')
}

// Standing rule (2026-08-31, "запиши раз и навсегда"): Telegram always gets
// a real full article, never a one-liner + link, since TG feeds Дзен.
const TG_LIMIT = 3600
function buildTelegramCaption({ dateKey, card, noteText }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const header = `<b>${esc(LABEL)} · ${humanDate(dateKey)}</b>\n«${esc(card.title)}»`
  // One link, woven into the closing sentence — post-telegram.mjs's caption
  // truncation only reliably preserves one "line containing <a " through a
  // cut, so this must be the single link, not a second separate one.
  const elenaLine = `👁 Если захочется не просто карты дня, а личного разговора — в проекте есть <a href="${ELENA_URL}">Елена</a>, практикующий таролог. Разбор ситуации — по донату, без спешки.`
  const tags = pickTarotHashtags(`${dateKey}|elena`, 6, 'ru')

  const budget = TG_LIMIT - header.length - elenaLine.length - tags.length - 16
  const paras = toParagraphs(stripBold(noteText.trim()))
  let body = ''
  let cut = false
  for (const p of paras) {
    const htmlP = boldToHtml(esc(p))
    if ((body + '\n\n' + htmlP).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + htmlP
  }
  if (!body) { body = boldToHtml(esc(firstSentences(stripBold(noteText), budget))); cut = true }
  if (cut) body += ' …'

  return [header, '', body, '', elenaLine, '', tags].join('\n')
}

const SCENARIOS = [
  { name: 'zoom-in', expr: () => ({ z: 'min(zoom+0.0006,1.15)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'zoom-out', expr: () => ({ z: 'max(1.15-0.0006*on,1.0)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-left-right', expr: (d) => ({ z: '1.12', x: `(iw*zoom-iw)*on/${d}`, y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-top-bottom', expr: (d) => ({ z: '1.12', x: 'iw/2-(iw/zoom/2)', y: `(ih*zoom-ih)*on/${d}` }) },
]
function pickScenario(dateKey) {
  const h = hashStr(`${dateKey}|elena-scenario`)
  return SCENARIOS[h % SCENARIOS.length]
}

// Reads the same in-house deck generate-video-tarot.mjs uses
// (src/data/rerih.json, public/decks/rerih/<id>.jpg) — real, already-owned
// content, already proven to post cleanly everywhere. Its descriptions are
// long (real book-length text, thousands of chars per Major Arcanum) — only
// a short excerpt is passed to the AI prompt as context, same discipline
// api/interpret.js already uses for this same deck elsewhere in the app.
let cardsCache = null
async function loadCards() {
  if (!cardsCache) cardsCache = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'rerih.json'), 'utf8'))
  return cardsCache
}
async function loadCard(cardId) {
  const cards = await loadCards()
  return cards.find((c) => c.id === cardId)
}

async function synthesizeSpeech(text, outPath) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping narration, video will be silent.')
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
async function getWordTimestamps(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY
  const buf = await readFile(audioPath)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'narration.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('language', 'ru')
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
    chunks.push({ text: slice.map((w) => w.word.trim()).join(' '), start: slice[0].start, end: slice[slice.length - 1].end })
  }
  return chunks
}
async function probeDurationSeconds(filePath) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath])
  return parseFloat(stdout.trim())
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const suffix = 'elena'
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()
  const displayDateKey = typeof args.date === 'string' ? args.date : todayDisplayKey()
  const cardId = pickDailyCardId(dateKey)
  const card = await loadCard(cardId)
  if (!card) throw new Error(`Tarot card not found: id ${cardId}`)
  // Short excerpt of the (very long, real book-text) description as AI
  // context — same cap style as api/interpret.js uses for this deck.
  const contextText = firstSentences(card.description.replace(/\n+/g, ' '), 800)

  const imagePath = path.join(ROOT, 'public', 'decks', 'rerih', `${cardId}.jpg`)
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })

  const noteText = await generateElenaCardNote(card, contextText)
  // ~700 chars ≈ 45-50s spoken at this TTS voice's normal pace — a real
  // short-form length, not the full 900-1200 char note (which would risk
  // running past a comfortable Shorts length) — the rest still reaches
  // people through the fuller written captions.
  const teaser = firstSentences(stripBold(noteText), 700)

  const fontDir = path.join(__dirname, 'fonts')
  const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
  const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

  const titleLines = wrapText(card.title.toUpperCase(), 22)
  const textFile = path.join(outDir, `overlay-${dateKey}-${suffix}.txt`)
  await writeFile(textFile, [LABEL, '', ...titleLines].join('\n'), 'utf8')

  const narrationText = `${card.title}. ${teaser}`
  const audioPath = path.join(outDir, `narration-${dateKey}-${suffix}.mp3`)
  const audioFile = await synthesizeSpeech(narrationText, audioPath)
  const audioDuration = audioFile ? await probeDurationSeconds(audioFile) : 0
  const words = audioFile ? await getWordTimestamps(audioFile) : null

  const fps = 30
  const duration = Math.max(10, Math.ceil(audioDuration + 1.5))
  const scenario = pickScenario(dateKey)
  const { z, x, y } = scenario.expr(duration * fps)

  const filterParts = [
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
      `zoompan=z='${z}':x='${x}':y='${y}':d=${duration * fps}:s=1080x1920:fps=${fps}`,
    `drawbox=x=0:y=0:w=1080:h=380:color=black@0.45:t=fill`,
    `drawtext=fontfile=${boldFont}:textfile=${textFile}:fontcolor=0xE8D5A8:fontsize=50:` +
      `line_spacing=14:x=(w-text_w)/2:y=80:box=0`,
    `drawbox=x=0:y=1450:w=1080:h=470:color=black@0.55:t=fill`,
  ]

  if (words && words.length) {
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
    // Whisper timestamps failed/unavailable — a static block instead of
    // word-synced bursts. Capped separately and much shorter than the full
    // (~700-char) narration teaser: a static block overflows its fixed-
    // height box past ~2 sentences (a real, previously-hit bug elsewhere in
    // this project) — this path is a rare fallback, not the normal case,
    // so it doesn't need to show as much text as gets spoken.
    const staticCaption = firstSentences(teaser, 180)
    const teaserLines = wrapText(staticCaption, 34)
    const teaserFile = path.join(outDir, `teaser-${dateKey}-${suffix}.txt`)
    await writeFile(teaserFile, teaserLines.join('\n'), 'utf8')
    filterParts.push(
      `drawtext=fontfile=${regularFont}:textfile=${teaserFile}:fontcolor=0xEDE5D4:fontsize=38:` +
        `line_spacing=12:x=(w-text_w)/2:y=1500:box=0`
    )
  }

  filterParts.push(
    `drawtext=fontfile=${regularFont}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=24:` +
      `x=(w-text_w)/2:y=h-56:box=0`
  )
  const filter = filterParts.join(',')

  const outVideo = path.join(outDir, `${dateKey}-${suffix}.mp4`)
  const ffmpegArgs = ['-y', '-loop', '1', '-i', imagePath]
  if (audioFile) ffmpegArgs.push('-i', audioFile)
  ffmpegArgs.push('-t', String(duration), '-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps))
  if (audioFile) ffmpegArgs.push('-c:a', 'aac', '-shortest', '-map', '0:v', '-map', '1:a')
  ffmpegArgs.push(outVideo)

  await run('ffmpeg', ffmpegArgs)

  await writeFile(path.join(outDir, `${dateKey}-${suffix}.caption.txt`), buildCaption({ dateKey: displayDateKey, card, noteText }), 'utf8')
  await writeFile(path.join(outDir, `${dateKey}-${suffix}.tiktok.txt`), buildTikTokCaption({ dateKey: displayDateKey, card, noteText }), 'utf8')
  await writeFile(path.join(outDir, `${dateKey}-${suffix}.telegram.txt`), buildTelegramCaption({ dateKey: displayDateKey, card, noteText }), 'utf8')

  const [, mm, dd] = dateKey.split('-')
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.meta.json`),
    JSON.stringify({
      // deckKey/deckTitle deliberately generic — never the real deck name,
      // same rule as generate-video-tarot.mjs.
      dateKey, cardId, locale: 'ru', title: card.title, deckKey: 'tarot', deckTitle: 'Таро',
      youtubeTitle: `Таро сегодня, ${dd}.${mm} · «${card.title}» #Shorts`,
      // No site page for this deck's own card pages in this context —
      // link straight to /elena/ itself, the actual point of this stream.
      moreUrl: ELENA_URL,
    }),
    'utf8'
  )
  console.log(JSON.stringify({ video: outVideo, cardId, title: card.title, scenario: scenario.name, narrated: Boolean(audioFile), duration }, null, 2))
}

// Guarded so other scripts/tests can safely `import` the exported helpers
// above without triggering a full video render as a side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
