// "Расклад-послание" — a hybrid format pulling one Tarot (Rerih) card and
// one Oracle card (golos/poslaniya/probuzhdenie) into a single reading,
// presented back to back as one video. BACKLOG.md "Building now"
// (2026-09-05, Studio's own pitch): "Сочетание классического Таро с вашим
// авторским Оракулом создаст уникальный контент, который невозможно найти
// на других каналах" — this app is the rare case that genuinely has both
// systems, most channels have only one.
//
// Structure mirrors generate-video-pickcard.mjs's segment-concat approach
// (intro / card A / card B / outro, each its own short mp4, stitched with
// ffmpeg concat) — same proven shape, not re-derived. Deliberately NOT a
// shared module with that file yet: this is the 3rd script using this
// pattern (after the daily card and pick-a-card), worth extracting once
// there's real reuse pressure, but tonight's priority is shipping working
// formats, not a refactor of an already-live daily pipeline.
//
// Each card's own teaser (from its existing description) plus a single
// hand-written connective line — deliberately NOT a fresh AI-generated
// synthesis prompt for the first version, to keep this launch low-risk.
//
// Usage: node scripts/social/generate-video-message-spread.mjs [--locale=ru|en] [--out=dir] [--date=YYYY-MM-DD] [--cards=rerih/5,poslaniya/12]
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickHashtags } from './hashtags.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const ORACLE_DECKS = [
  { key: 'golos', total: 69 },
  { key: 'poslaniya', total: 80 },
  { key: 'probuzhdenie', total: 54 },
]
const DECKS_WITH_EN_IMAGES = new Set(['poslaniya'])
function cardImgFile(deckKey, cardId, locale) {
  return locale === 'en' && DECKS_WITH_EN_IMAGES.has(deckKey) ? `${cardId}-en.jpg` : `${cardId}.jpg`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0
  return h
}
function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
// Display-only "what day is it really" for the human-facing caption text —
// deliberately kept SEPARATE from `dateKey` above (used for filenames and
// posted-marker tags, which just need generate + post steps in the same
// job run to agree with each other, via the runner's own plain UTC clock —
// changing that basis risks the two steps computing different dateKeys if
// they ever straddle a rollover). Real bug, confirmed live 2026-09-09/10:
// this format's cron fires at 20:00 UTC, and with GitHub's own routine
// 1-4h scheduling lag on top, actual execution regularly lands well past
// both Moscow's (21:00 UTC) and Bangkok's (17:00 UTC) midnight — a run at
// 22:06 UTC still computed dateKey "2026-09-09" (correct by raw UTC clock)
// but by then real viewers in both timezones already saw the 10th, so the
// caption's "9 сентября" read as a full day stale. Computed from the real
// current moment via Europe/Moscow (this project's reference audience
// timezone, per the daily pipelines' own "ready by Russian morning"
// framing) — NOT from `dateKey`.
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

// Pick one card per side, independent seeds so this pipeline's draw never
// coincides with the daily Tarot post or the daily oracle card of the day.
function pickPair(dateKey) {
  const th = hashStr(`${dateKey}|message-spread|tarot`)
  const tarotCardId = th % 78 // Rerih ids are 0-77
  const oh = hashStr(`${dateKey}|message-spread|oracle`)
  const deck = ORACLE_DECKS[oh % ORACLE_DECKS.length]
  const oracleCardId = (oh % deck.total) + 1
  return { tarot: { deckKey: 'rerih', cardId: tarotCardId }, oracle: { deckKey: deck.key, cardId: oracleCardId } }
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

async function makeGradientFrame(outPath) {
  await run('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=1080x1920:c0=0x0a0a16:c1=0x1c1730:x0=540:y0=300:x1=540:y1=1920',
    '-frames:v', '1', outPath,
  ])
}

// Nick, 2026-09-05, live screenshot feedback: the intro (and bridge) frame
// was a bare gradient with no image at all — "чтобы в видео всегда вначале
// внутри было изображение, а не пустой внутри". Same fix as
// generate-video-pickcard.mjs's makeIntroCollage(), just a 2-column layout
// for this format's 2 cards (Tarot + Oracle) instead of 3.
async function makeIntroCollage(outPath, gradientPath, cardImagePaths) {
  const colW = 1080 / 2
  const thumbW = 380
  const xs = [Math.round(colW * 0 + (colW - thumbW) / 2), Math.round(colW * 1 + (colW - thumbW) / 2)]
  const thumbY = 560
  const filterComplex = [
    `[1:v]scale=${thumbW}:-1[c1]`,
    `[2:v]scale=${thumbW}:-1[c2]`,
    `[0:v][c1]overlay=${xs[0]}:${thumbY}[bg1]`,
    `[bg1][c2]overlay=${xs[1]}:${thumbY}`,
  ].join(';')
  await run('ffmpeg', [
    '-y',
    '-i', gradientPath,
    '-i', cardImagePaths[0], '-i', cardImagePaths[1],
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
const WATERMARK = 'nikolablajen.ru'

async function renderSegment({ outDir, tag, imagePath, narrationText, locale, headerLines, fallbackCaptionLines, scenarioSeed, static: staticFrame }) {
  const audioPath = path.join(outDir, `ms-audio-${tag}.mp3`)
  const narrated = narrationText ? await synthesizeSpeech(narrationText, audioPath) : null
  let audioFile = narrated
  let audioDuration = narrated ? await probeDurationSeconds(narrated) : 0
  const words = narrated ? await getWordTimestamps(narrated, locale) : null
  if (!audioFile) {
    audioDuration = Math.max(3, Math.ceil(String(narrationText || '').length / 14))
    audioFile = path.join(outDir, `ms-silence-${tag}.mp3`)
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', String(audioDuration), '-q:a', '9', audioFile])
  }
  const duration = Math.max(3, Math.ceil(audioDuration + 0.8))
  const fps = 30

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
    const headerFile = path.join(outDir, `ms-header-${tag}.txt`)
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
      const chunkFile = path.join(outDir, `ms-cap-${tag}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=52:` +
          `line_spacing=14:x=(w-text_w)/2:y=1500:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else if (fallbackCaptionLines && fallbackCaptionLines.length) {
    const capFile = path.join(outDir, `ms-caption-${tag}.txt`)
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

  const outVideo = path.join(outDir, `ms-seg-${tag}.mp4`)
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
  const listFile = path.join(outDir, `ms-concat-${Date.now()}.txt`)
  await writeFile(listFile, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outVideo])
  await unlink(listFile).catch(() => {})
}

const DECK_TITLES = {
  ru: { golos: 'Голос Господа', poslaniya: 'Послания Бога', probuzhdenie: 'Пробуждение Души', rerih: 'Карты Рёрига' },
  en: { golos: 'Voice of God', poslaniya: 'Messages of God', probuzhdenie: 'Awakening of the Soul', rerih: 'Röhrig Tarot' },
}

const COPY = {
  ru: {
    label: 'РАСКЛАД-ПОСЛАНИЕ',
    introFallback: ['Таро + Оракул —', 'два послания в одном раскладе'],
    introNarration: 'Расклад-послание. Одна карта Таро — и одна карта-послание Оракула. Смотри, что они говорят вместе.',
    tarotHeader: 'ТАРО',
    oracleHeader: 'ОРАКУЛ',
    cardNarration: (title, teaser) => `«${title}». ${teaser}`,
    bridgeHeader: 'ВМЕСТЕ',
    bridgeFallback: ['Что это значит', 'вместе'],
    bridgeNarration: (tarotTitle, oracleTitle) => `Таро называет то, что есть на самом деле. Оракул отвечает, что с этим делать. «${tarotTitle}» и «${oracleTitle}» — вместе это не два разных знака, а один разговор.`,
    outroFallback: ['Свой вопрос — в приложении', '«Никола Блажен»'],
    outroNarration: 'Свой личный расклад — в приложении «Никола Блажен»: полное Таро Рёрига, три авторские колоды Оракула, и живое толкование под твой собственный вопрос.',
  },
  en: {
    label: 'MESSAGE SPREAD',
    introFallback: ['Tarot + Oracle —', 'two messages in one spread'],
    introNarration: "A message spread. One Tarot card, and one Oracle message card. Watch what they say together.",
    tarotHeader: 'TAROT',
    oracleHeader: 'ORACLE',
    cardNarration: (title, teaser) => `"${title}." ${teaser}`,
    bridgeHeader: 'TOGETHER',
    bridgeFallback: ['What it means', 'together'],
    bridgeNarration: (tarotTitle, oracleTitle) => `Tarot names what's actually there. The Oracle answers what to do about it. "${tarotTitle}" and "${oracleTitle}" aren't two separate signs — together they're one conversation.`,
    outroFallback: ['Your own question — in the', 'Nikola Blajen app'],
    outroNarration: 'Your own personal spread is in the Nikola Blajen app: the full Röhrig Tarot, three original Oracle decks, and a living reading for your own question.',
  },
}

function buildCaption({ locale, dateKey, tarot, oracle }) {
  const tags = pickHashtags(`${dateKey}|message-spread`, locale, null, 16)
  const header = locale === 'en'
    ? `🔮 Message spread · ${humanDate(dateKey, 'en')}\n✨ Tarot + Oracle, one reading`
    : `🔮 Расклад-послание · ${humanDate(dateKey, 'ru')}\n✨ Таро + Оракул — один расклад`
  const line1 = locale === 'en'
    ? `🃏 Tarot: “${tarot.card.title}” — Röhrig Tarot`
    : `🃏 Таро: «${tarot.card.title}» — Карты Рёрига`
  const line2 = locale === 'en'
    ? `🕊 Oracle: “${oracle.card.title}” — “${DECK_TITLES.en[oracle.deckKey]}” deck`
    : `🕊 Оракул: «${oracle.card.title}» — колода «${DECK_TITLES.ru[oracle.deckKey]}»`
  const cta = locale === 'en'
    ? `💬 Which of the two speaks to you more today — the Tarot or the Oracle?`
    : `💬 Что откликается больше — Таро или Оракул?`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & Tarot in one app`
    : `🕊 Никола Блажен — оракул и Таро в одном приложении`
  return [header, '', line1, line2, '', cta, '', footer, '', tags].join('\n')
}
function buildTikTokCaption({ locale, dateKey }) {
  const tags = pickHashtags(`${dateKey}|message-spread`, locale, null, 5)
  const header = locale === 'en' ? `🔮 Message spread · ${humanDate(dateKey, 'en')}` : `🔮 Расклад-послание · ${humanDate(dateKey, 'ru')}`
  const cta = locale === 'en' ? `Tarot + Oracle, one reading — which speaks to you more?` : `Таро + Оракул, один расклад — что откликается больше?`
  const footer = locale === 'en' ? `🕊 Nikola Blajen` : `🕊 Никола Блажен`
  return [header, '', cta, '', footer, '', tags].join('\n')
}
function buildTelegramCaption({ dateKey, tarot, oracle }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tags = pickHashtags(`${dateKey}|message-spread`, 'ru', null, 6)
  const header = `🔮 <b>Расклад-послание · ${humanDate(dateKey, 'ru')}</b>\n✨ Таро + Оракул — один расклад`
  const line1 = `🃏 Таро: «${esc(tarot.card.title)}» — Карты Рёрига`
  const line2 = `🕊 Оракул: «${esc(oracle.card.title)}» — колода «${esc(DECK_TITLES.ru[oracle.deckKey])}»`
  const cta = '💬 Что откликается больше — Таро или Оракул?'
  const links = `Полное Таро Рёрига, три колоды Оракула и живое толкование под твой вопрос — <a href="https://nikolablajen.ru/">в приложении «Никола Блажен»</a>.`
  return [header, '', line1, line2, '', cta, '', links, '', tags].join('\n')
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()
  const displayDateKey = typeof args.date === 'string' ? args.date : todayDisplayKey()
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })
  const copy = COPY[locale]

  // --cards=rerih/<id>,<deckKey>/<id> — explicit override (see
  // generate-video-pickcard.mjs's --cards for the same reasoning: reproduce
  // an exact pair across a re-run, e.g. an EN twin of an already-posted run).
  let pair
  if (typeof args.cards === 'string') {
    const [a, b] = args.cards.split(',').map((s) => {
      const [deckKey, id] = s.trim().split('/')
      return { deckKey, cardId: Number(id) }
    })
    pair = a.deckKey === 'rerih' ? { tarot: a, oracle: b } : { tarot: b, oracle: a }
  } else {
    pair = pickPair(dateKey)
  }

  const tarotCard = await loadCard('rerih', pair.tarot.cardId, locale)
  const oracleCard = await loadCard(pair.oracle.deckKey, pair.oracle.cardId, locale)
  if (!tarotCard) throw new Error(`tarot card not found: rerih/${pair.tarot.cardId} (${locale})`)
  if (!oracleCard) throw new Error(`oracle card not found: ${pair.oracle.deckKey}/${pair.oracle.cardId} (${locale})`)
  const tarot = { deckKey: 'rerih', cardId: pair.tarot.cardId, card: tarotCard }
  const oracle = { deckKey: pair.oracle.deckKey, cardId: pair.oracle.cardId, card: oracleCard }

  const gradientPath = path.join(outDir, `ms-gradient-${dateKey}-${locale}.jpg`)
  await makeGradientFrame(gradientPath)
  const introPath = path.join(outDir, `ms-intro-collage-${dateKey}-${locale}.jpg`)
  await makeIntroCollage(introPath, gradientPath, [
    path.join(ROOT, 'public', 'decks', 'rerih', `${tarot.cardId}.jpg`),
    path.join(ROOT, 'public', 'decks', oracle.deckKey, cardImgFile(oracle.deckKey, oracle.cardId, locale)),
  ])

  const segments = []
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-intro`, imagePath: introPath, locale,
    narrationText: copy.introNarration,
    headerLines: [copy.label], fallbackCaptionLines: copy.introFallback,
    scenarioSeed: `${dateKey}|ms-intro`, static: true,
  }))
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-tarot`,
    imagePath: path.join(ROOT, 'public', 'decks', 'rerih', `${tarot.cardId}.jpg`),
    locale,
    narrationText: copy.cardNarration(tarotCard.title, firstSentences(tarotCard.description, 260)),
    headerLines: [copy.tarotHeader], fallbackCaptionLines: wrapText(tarotCard.title, 22),
    scenarioSeed: `${dateKey}|ms-tarot`,
  }))
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-oracle`,
    imagePath: path.join(ROOT, 'public', 'decks', oracle.deckKey, cardImgFile(oracle.deckKey, oracle.cardId, locale)),
    locale,
    narrationText: copy.cardNarration(oracleCard.title, firstSentences(oracleCard.description, 220)),
    headerLines: [copy.oracleHeader], fallbackCaptionLines: wrapText(oracleCard.title, 22),
    scenarioSeed: `${dateKey}|ms-oracle`,
  }))
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-bridge`, imagePath: gradientPath, locale,
    narrationText: copy.bridgeNarration(tarotCard.title, oracleCard.title),
    headerLines: [copy.bridgeHeader], fallbackCaptionLines: copy.bridgeFallback,
    scenarioSeed: `${dateKey}|ms-bridge`, static: true,
  }))
  segments.push(await renderSegment({
    outDir, tag: `${dateKey}-${locale}-outro`, imagePath: gradientPath, locale,
    narrationText: copy.outroNarration,
    headerLines: [copy.label], fallbackCaptionLines: copy.outroFallback,
    scenarioSeed: `${dateKey}|ms-outro`, static: true,
  }))

  const outVideo = path.join(outDir, `${dateKey}-message-spread-${locale}.mp4`)
  await concatSegments(segments.map((s) => s.path), outVideo, outDir)
  for (const s of segments) await unlink(s.path).catch(() => {})
  await unlink(gradientPath).catch(() => {})
  await unlink(introPath).catch(() => {})

  // File names below keep the real `dateKey` (generate/post steps must
  // agree on it) — only the text shown to humans uses `displayDateKey`.
  await writeFile(path.join(outDir, `${dateKey}-message-spread-${locale}.caption.txt`), buildCaption({ locale, dateKey: displayDateKey, tarot, oracle }), 'utf8')
  await writeFile(path.join(outDir, `${dateKey}-message-spread-${locale}.tiktok.txt`), buildTikTokCaption({ locale, dateKey: displayDateKey }), 'utf8')
  if (locale === 'ru') {
    await writeFile(path.join(outDir, `${dateKey}-message-spread-ru.telegram.txt`), buildTelegramCaption({ dateKey: displayDateKey, tarot, oracle }), 'utf8')
  }
  await writeFile(
    path.join(outDir, `${dateKey}-message-spread-${locale}.meta.json`),
    JSON.stringify({
      dateKey, locale,
      cards: [{ deckKey: 'rerih', cardId: tarot.cardId, title: tarotCard.title }, { deckKey: oracle.deckKey, cardId: oracle.cardId, title: oracleCard.title }],
      youtubeTitle: locale === 'en'
        ? `Message spread: Tarot + Oracle — ${tarotCard.title} & ${oracleCard.title} #Shorts`
        : `Расклад-послание: Таро + Оракул — ${tarotCard.title} и ${oracleCard.title} #Shorts`,
      moreUrl: `https://nikolablajen.ru/${locale === 'en' ? 'en/' : ''}`,
    }),
    'utf8'
  )

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
  console.log(JSON.stringify({ video: outVideo, locale, tarot: `rerih/${tarot.cardId} ${tarotCard.title}`, oracle: `${oracle.deckKey}/${oracle.cardId} ${oracleCard.title}`, duration: totalDuration }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
