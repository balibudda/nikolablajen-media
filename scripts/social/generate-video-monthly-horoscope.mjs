// Renders a "Прогноз на месяц" / "Monthly Forecast" video — narration for
// all twelve zodiac signs, one video per calendar month. BACKLOG.md
// "Building now" (2026-09-05, Nick "делаем!") — higher production value,
// longer-form than the daily horoscope video. Sibling of
// generate-video-horoscope.mjs (same segment-render approach, copied and
// adapted rather than shared — see that file's sibling scripts tonight for
// the same reasoning), but:
// - content comes from generateMonthlyHoroscope() (prompts.mjs), a
//   dedicated month-scope AI prompt — NOT the daily one run 30 times, and
//   NOT a concatenation of daily lines;
// - no per-sign "lucky color/number" subheader (that's a daily-horoscope
//   concept, doesn't make sense for a month);
// - no full-article Telegram/Дзен post for v1 — just the video + a short
//   caption per channel, same "keep the launch lower-risk" reasoning as
//   this session's other new formats tonight (Расклад-послание, event
//   calendar).
//
// Usage: node scripts/social/generate-video-monthly-horoscope.mjs [--locale=ru|en] [--out=dir] [--month=YYYY-MM]
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZODIAC_SIGNS } from '../blog/horoscope-data.mjs'
import { generateMonthlyHoroscope, generateHeadline } from './prompts.mjs'
import { pickHashtags } from './hashtags.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
// post-instagram.mjs/post-telegram.mjs/post-vk.mjs/post-youtube.mjs/
// post-tiktok.mjs all look up their input file as `${getTodayKey()}-
// ${suffix}.EXT` (today's full date, not a month key) — every OUTPUT file
// this script writes must use today's date, not monthKey, or the posting
// scripts get an ENOENT (hit live 2026-09-05: files were written as
// `2026-09-monthly-horoscope-ru.mp4` while post-instagram.mjs looked for
// `2026-09-05-monthly-horoscope-ru.mp4`). monthKey stays the key for
// CONTENT (which month's forecast) — the two are deliberately different.
function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function humanMonth(monthKey, locale) {
  const [y, m] = monthKey.split('-').map(Number)
  return locale === 'en' ? `${MONTHS_EN[m - 1]} ${y}` : `${MONTHS_RU_NOM[m - 1]} ${y}`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0
  return h
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

// Was the "смешной Бог" — a lively, wry `ballad` read (Nick, 2026-09-03:
// "ИИ голосом но весело — вируситься будет"). Reversed 2026-09-05: same
// solemn `onyx` narration as the card-of-day videos, no style instructions
// — "мне нравится намного больше, он добавляет серьезности".
// Keep the whole clip UNDER 3:00 so YouTube treats it as a Short / it goes
// to Reels (Nick, 2026-09-04: a 3:02 horoscope went out as a regular
// video). Target ~2:45 — "до 2:50 и норм, а то совсем сокращённо будет".
// So: read a bit faster (that alone takes the old 3:02 down to ~2:45) and
// only clamp genuinely runaway sign lines, don't trim the normal ones.
const TTS_SPEED = 1.1
const SIGN_NARRATION_MAX = 240 // only trims outlier-long flavor lines

function clampSpeech(s, max = SIGN_NARRATION_MAX) {
  const t = String(s || '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (at > max * 0.5 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, '') + '…').trim()
}

async function synthesizeSpeech(text, outPath, { voice = 'onyx', speed = TTS_SPEED, instructions } = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping narration, segment will be silent.')
    return null
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, speed, instructions, input: text, response_format: 'mp3' }),
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

// One fixed dark gradient per sign (brand palette family — same darkness
// range as the horoscope cover in write-daily-horoscope.mjs and the
// pick-a-card intro/outro) so each sign has a consistent, distinct look
// day to day instead of all twelve segments looking identical.
const SIGN_GRADIENTS = {
  aries: ['0x1a0a0a', '0x2a0f0f'],
  taurus: ['0x0a1a0f', '0x0f2a18'],
  gemini: ['0x1a170a', '0x2a2410'],
  cancer: ['0x0a121a', '0x0f1e2a'],
  leo: ['0x1a130a', '0x2a1f0f'],
  virgo: ['0x120a1a', '0x1e0f2a'],
  libra: ['0x1a0a17', '0x2a0f24'],
  scorpio: ['0x140a0a', '0x220f0f'],
  sagittarius: ['0x0a151a', '0x0f232a'],
  capricorn: ['0x10120a', '0x1c200f'],
  aquarius: ['0x0a1a1a', '0x0f2a2a'],
  pisces: ['0x0a0a1a', '0x0f0f2a'],
}
const INTRO_GRADIENT = ['0x0a0a16', '0x1c1730'] // same as write-daily-horoscope.mjs's cover

async function makeGradientFrame(outPath, [c0, c1]) {
  await run('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', `gradients=s=1080x1920:c0=${c0}:c1=${c1}:x0=540:y0=300:x1=540:y1=1920`,
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

const WATERMARK = 'nikolablajen.ru'
const fontDir = path.join(__dirname, 'fonts')
const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

// PTSerif has no glyphs for the Unicode zodiac symbols (♈–♓, U+2648–2653) —
// same missing-glyph-box problem as emoji. DejaVu Sans does cover that
// block properly, and `fonts-dejavu-core` is already installed by every
// video workflow in this repo — first path that exists wins, so this also
// works for local testing (`brew install --cask font-dejavu-sans`).
const SYMBOL_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  path.join(process.env.HOME || '', 'Library/Fonts/DejaVuSans-Bold.ttf'),
  path.join(process.env.HOME || '', 'Library/Fonts/DejaVuSans.ttf'),
]
const symbolFont = SYMBOL_FONT_CANDIDATES.find((p) => existsSync(p)) || boldFont

const ZODIAC_SYMBOL = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍',
  libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
}

// Same recipe as generate-video-pickcard.mjs's renderSegment: still image +
// Ken Burns + a short header (optionally two lines: name + a small lucky
// color/number line) + word-synced caption bursts + its own narration.
// Always carries an audio stream (real or silent) so segments concat
// cleanly with `-c copy`.
async function renderSegment({ outDir, tag, imagePath, narrationText, locale, headerLines, subheaderLine, fallbackCaptionLines, scenarioSeed, centerSymbol, centerWheel, static: staticFrame }) {
  const audioPath = path.join(outDir, `hs-audio-${tag}.mp3`)
  const narrated = narrationText ? await synthesizeSpeech(narrationText, audioPath) : null
  let audioFile = narrated
  let audioDuration = narrated ? await probeDurationSeconds(narrated) : 0
  const words = narrated ? await getWordTimestamps(narrated, locale) : null
  if (!audioFile) {
    audioDuration = Math.max(2.5, Math.ceil(String(narrationText || '').length / 14))
    audioFile = path.join(outDir, `hs-silence-${tag}.mp3`)
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', String(audioDuration), '-q:a', '9', audioFile])
  }
  const duration = Math.max(2.5, Math.ceil(audioDuration + 0.6))
  const fps = 30

  // Static (no Ken Burns) for frames with a lot of fine detail — zoompan's
  // frame-by-frame rounding shows up as a visible jitter on thin lines/small
  // glyphs (same issue Nick caught on generate-video-pickcard.mjs's intro
  // collage). The 12-symbol wheel below has exactly that kind of detail.
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
    const headerFile = path.join(outDir, `hs-header-${tag}.txt`)
    await writeFile(headerFile, headerLines.join('\n'), 'utf8')
    filterParts.push(`drawbox=x=0:y=0:w=1080:h=${subheaderLine ? 460 : 360}:color=black@0.45:t=fill`)
    filterParts.push(
      `drawtext=fontfile=${boldFont}:textfile=${headerFile}:fontcolor=0xE8D5A8:fontsize=64:` +
        `line_spacing=16:x=(w-text_w)/2:y=140:box=0`
    )
    if (subheaderLine) {
      const subFile = path.join(outDir, `hs-subheader-${tag}.txt`)
      await writeFile(subFile, subheaderLine, 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${subFile}:fontcolor=0xB8AE99:fontsize=32:` +
          `x=(w-text_w)/2:y=340:box=0`
      )
    }
  }
  if (centerSymbol) {
    // Nick's feedback on the first version: "где гороскоп слова вверху и
    // внизу. В центре пустота вообще" — the middle of the frame was just
    // bare gradient. Each sign's own symbol now fills that space for the
    // whole segment (next sign, next symbol, next segment).
    const symbolFile = path.join(outDir, `hs-symbol-${tag}.txt`)
    await writeFile(symbolFile, centerSymbol, 'utf8')
    filterParts.push(
      `drawtext=fontfile=${symbolFont}:textfile=${symbolFile}:fontcolor=0xE8D5A8@0.9:fontsize=420:` +
        `x=(w-text_w)/2:y=900-text_h/2:box=0`
    )
  } else if (centerWheel) {
    // Nick, on the intro specifically: "вначале до овна в центре пустой...
    // а то черный квадрат малевича по центру" — before the first sign
    // starts there was nothing to show yet, so fill that same space with
    // all twelve symbols arranged in a ring instead of leaving it bare.
    const cx = 540, cy = 900, radius = 300
    const symbols = Object.values(ZODIAC_SYMBOL)
    for (let i = 0; i < symbols.length; i++) {
      const angle = (i / symbols.length) * 2 * Math.PI - Math.PI / 2
      const px = Math.round(cx + radius * Math.cos(angle))
      const py = Math.round(cy + radius * Math.sin(angle))
      const symFile = path.join(outDir, `hs-wheelsym-${tag}-${i}.txt`)
      await writeFile(symFile, symbols[i], 'utf8')
      filterParts.push(
        `drawtext=fontfile=${symbolFont}:textfile=${symFile}:fontcolor=0xE8D5A8@0.85:fontsize=100:` +
          `x=${px}-text_w/2:y=${py}-text_h/2:box=0`
      )
    }
  }
  filterParts.push(`drawbox=x=0:y=1450:w=1080:h=470:color=black@0.55:t=fill`)
  if (words && words.length) {
    const chunks = chunkWords(words, 4)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const lines = wrapText(chunk.text, 26)
      const chunkFile = path.join(outDir, `hs-cap-${tag}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=52:` +
          `line_spacing=14:x=(w-text_w)/2:y=1500:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else if (fallbackCaptionLines && fallbackCaptionLines.length) {
    const capFile = path.join(outDir, `hs-caption-${tag}.txt`)
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

  const outVideo = path.join(outDir, `hs-seg-${tag}.mp4`)
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
  const listFile = path.join(outDir, `hs-concat-${Date.now()}.txt`)
  await writeFile(listFile, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outVideo])
  await unlink(listFile).catch(() => {})
}

const COPY = {
  ru: {
    introHeader: 'ПРОГНОЗ НА МЕСЯЦ',
    introNarration: 'Прогноз на месяц — для всех знаков зодиака. Зеркало, а не предсказание: возьми то, что откликается.',
    introFallback: ['Зеркало, а не предсказание —', 'возьми то, что откликается'],
    signName: (z) => z.ru.toUpperCase(),
    signNarration: (z, flavor) => `${z.ru}. ${flavor}`,
    outroHeader: 'КАКОЙ ЗНАК ТВОЙ?',
    outroNarration: 'Какой знак откликнулся тебе на этот месяц — напиши в комментариях. Полный прогноз на все знаки — в приложении «Никола Блажен».',
    outroFallback: ['Напиши в комментариях,', 'какой знак откликнулся'],
  },
  en: {
    introHeader: 'MONTHLY FORECAST',
    introNarration: "This month's forecast — for every zodiac sign. A mirror, not a prediction: take what resonates.",
    introFallback: ['A mirror, not a prediction —', 'take what resonates'],
    signName: (z) => z.en.toUpperCase(),
    signNarration: (z, flavor) => `${z.en}. ${flavor}`,
    outroHeader: 'WHICH SIGN IS YOU?',
    outroNarration: 'Which sign resonated with you this month — comment below. The full forecast for every sign is in the Nikola Blajen app.',
    outroFallback: ['Comment which sign', 'resonated with you'],
  },
}

function buildCaption({ locale, monthLabel, monthKey }) {
  const tags = pickHashtags(`${monthKey}|monthly-horoscope`, locale, null, 16)
  const header = locale === 'en'
    ? `🔮 Monthly forecast · ${monthLabel}\n✨ All twelve signs, one video`
    : `🔮 Прогноз на месяц · ${monthLabel}\n✨ Все двенадцать знаков в одном ролике`
  const intro = locale === 'en'
    ? 'A mirror, not a prediction: take what resonates, leave the rest.'
    : 'Зеркало, а не предсказание: возьми то, что откликается, остальное оставь.'
  const signList = ZODIAC_SIGNS.map((z) => `${z.emoji} ${locale === 'en' ? z.en : z.ru}`).join('  ')
  const cta = locale === 'en'
    ? `💬 Comment your sign — did this month's line land?`
    : `💬 Напиши свой знак в комментариях — откликнулось?`
  const more = locale === 'en'
    ? `📖 Full monthly forecast for every sign — in the Nikola Blajen app.`
    : `📖 Полный прогноз на месяц для всех знаков — в приложении «Никола Блажен».`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle & card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  return [header, '', intro, '', signList, '', cta, '', more, '', footer, '', tags].join('\n')
}

function buildTikTokCaption({ locale, monthKey, monthLabel }) {
  const tags = pickHashtags(`${monthKey}|monthly-horoscope`, locale, null, 5)
  const header = locale === 'en'
    ? `🔮 Monthly forecast · ${monthLabel}`
    : `🔮 Прогноз на месяц · ${monthLabel}`
  const cta = locale === 'en'
    ? `Comment your sign — did this month's line land?`
    : `Напиши свой знак в комментариях — откликнулось?`
  const more = locale === 'en'
    ? `📖 Full text — in the Nikola Blajen app.`
    : `📖 Полный текст — в приложении «Никола Блажен».`
  return [header, '', cta, '', more, '', tags].join('\n')
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// v1 has NO full-article Telegram/Дзен post — see the file header comment.
// This just builds a short single-message TG caption (video + link), same
// shape as the other new formats tonight (Расклад-послание, event
// calendar) rather than the daily horoscope's full 12-sign article.
const MONTHLY_TG_INTROS = [
  'Прогноз не на день, а на всю арку месяца впереди — где будет легко, где придётся потерпеть, и что держать в фокусе все четыре недели.',
  'Месяц — это не один день, повторённый тридцать раз. Ниже — суть на все двенадцать знаков.',
  'Не общие слова на месяц вперёд, а по существу: для каждого знака — где фокус, где испытание, что делать.',
]

function buildTelegramCaption({ monthKey, monthLabel, aiHoro = null, headline = '' }) {
  const tags = pickHashtags(`${monthKey}|monthly-horoscope`, 'ru', null, 6)
  const title = headline || aiHoro?.title || `Прогноз на ${monthLabel}`
  const header = `<b>${escHtml(title)}</b>`
  const intro = MONTHLY_TG_INTROS[hashStr(monthKey) % MONTHLY_TG_INTROS.length]
  const cta = '💬 Напиши свой знак в комментариях — откликнулось?'
  // Real clickable link, not just a text mention (Nick, 2026-09-16: every
  // TG post needs an active link so the Telegram→Дзен crosspost actually
  // carries a way back to the site — this caption was missing one
  // entirely before).
  const more = `📖 Полный прогноз на месяц для всех знаков — <a href="https://nikolablajen.ru/">в приложении «Никола Блажен»</a>.`
  return [header, '', intro, '', cta, '', more, '', tags].join('\n')
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const monthKey = typeof args.month === 'string' ? args.month : getCurrentMonthKey()
  const monthLabel = humanMonth(monthKey, locale)
  const fileKey = getTodayKey() // output filenames key off today's date, not the month — see getTodayKey()'s own comment
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })
  const copy = COPY[locale]

  // AI text per sign (short = the lively narration) for the whole month
  // ahead + a fresh title shown big at the start of the video. Falls back
  // to the daily flavor line on failure (generateMonthlyHoroscope already
  // does its own JSON-shape fallback internally, same contract as
  // generateHoroscope).
  const aiHoro = await generateMonthlyHoroscope(monthKey, locale)
  console.log(`monthly horoscope video (${locale}): ${aiHoro ? 'AI' : 'template fallback'}`)
  const hsHeadline = locale === 'ru'
    ? await generateHeadline({ kind: 'horoscope', dateHuman: `на ${monthLabel}`, locale: 'ru' })
    : ''
  const videoTitle = aiHoro?.title || copy.introHeader

  const gradientPaths = {}
  const introGradient = path.join(outDir, `hs-gradient-${monthKey}-${locale}-intro.jpg`)
  await makeGradientFrame(introGradient, INTRO_GRADIENT)
  gradientPaths.intro = introGradient
  for (const z of ZODIAC_SIGNS) {
    const p = path.join(outDir, `hs-gradient-${monthKey}-${locale}-${z.key}.jpg`)
    await makeGradientFrame(p, SIGN_GRADIENTS[z.key] || INTRO_GRADIENT)
    gradientPaths[z.key] = p
  }

  // Two char-count-based live-test overruns on 2026-09-05 (3:37, then 3:20,
  // then STILL 3:19 after retuning the assumed chars/sec constant) proved
  // that estimating from text length alone isn't reliable enough for this
  // format's prose — the natural sign-flavor length barely varies, so a
  // character budget mostly doesn't bind at all. Switched to budgeting off
  // the intro segment's REAL measured duration (ffprobe, not a guess) —
  // only the per-sign chars/sec conversion is still an estimate, and that
  // error no longer compounds across the whole video.
  const REAL_CPS = 12.5
  const introNarrationText = clampSpeech(
    aiHoro?.title ? `${aiHoro.title}. ${copy.introNarration}` : copy.introNarration, 180
  )
  const outroNarrationText = clampSpeech(copy.outroNarration, 150)

  const segments = []
  const introSegment = await renderSegment({
    outDir, tag: `${monthKey}-${locale}-intro`, imagePath: gradientPaths.intro, locale,
    narrationText: introNarrationText,
    // The headline, big and centred, is the first thing on screen.
    headerLines: wrapText(videoTitle, 20), fallbackCaptionLines: copy.introFallback,
    scenarioSeed: `${monthKey}|hs-intro`, centerWheel: true, static: true,
  })
  segments.push(introSegment)

  // Hard ceiling with real margin under the 180s (3:00) Shorts cutoff.
  // Outro is reserved conservatively (its own clamp is only 150 chars, but
  // budget as if it reads slow) since it isn't rendered until after the
  // signs loop and so has no real measurement to budget against yet.
  const HARD_TOTAL = 172
  const OUTRO_RESERVE = 18
  const signCount = ZODIAC_SIGNS.length
  const remainingForSigns = Math.max(signCount * 8, HARD_TOTAL - introSegment.duration - OUTRO_RESERVE)
  const perSignSeconds = remainingForSigns / signCount
  const signCap = Math.max(70, Math.min(SIGN_NARRATION_MAX, Math.floor((perSignSeconds - 0.6) * REAL_CPS)))
  console.log(`monthly horoscope video: intro=${introSegment.duration.toFixed(1)}s, per-sign budget ${perSignSeconds.toFixed(1)}s (cap ${signCap} chars), outro reserve ${OUTRO_RESERVE}s, hard ceiling ${HARD_TOTAL}s`)

  for (const z of ZODIAC_SIGNS) {
    const flavor = aiHoro?.[z.key]?.short || (locale === 'en' ? z.flavorEn : z.flavorRu)
    const spoken = clampSpeech(flavor, signCap)
    segments.push(await renderSegment({
      outDir, tag: `${monthKey}-${locale}-${z.key}`, imagePath: gradientPaths[z.key], locale,
      narrationText: copy.signNarration(z, spoken),
      headerLines: [copy.signName(z)],
      centerSymbol: ZODIAC_SYMBOL[z.key],
      // on-screen caption keeps the FULL flavor line — only the spoken
      // narration is trimmed for the 3-min cap.
      fallbackCaptionLines: wrapText(flavor, 30),
      scenarioSeed: `${monthKey}|hs-${z.key}`,
    }))
  }
  segments.push(await renderSegment({
    outDir, tag: `${monthKey}-${locale}-outro`, imagePath: gradientPaths.intro, locale,
    narrationText: outroNarrationText,
    headerLines: [copy.outroHeader], fallbackCaptionLines: copy.outroFallback,
    scenarioSeed: `${monthKey}|hs-outro`,
  }))

  const outVideo = path.join(outDir, `${fileKey}-monthly-horoscope-${locale}.mp4`)
  await concatSegments(segments.map((s) => s.path), outVideo, outDir)

  for (const s of segments) await unlink(s.path).catch(() => {})
  for (const p of Object.values(gradientPaths)) await unlink(p).catch(() => {})

  const caption = buildCaption({ locale, monthLabel, monthKey })
  await writeFile(path.join(outDir, `${fileKey}-monthly-horoscope-${locale}.caption.txt`), caption, 'utf8')
  await writeFile(
    path.join(outDir, `${fileKey}-monthly-horoscope-${locale}.tiktok.txt`),
    buildTikTokCaption({ locale, monthKey, monthLabel }),
    'utf8'
  )
  if (locale === 'ru') {
    await writeFile(
      path.join(outDir, `${fileKey}-monthly-horoscope-ru.telegram.txt`),
      buildTelegramCaption({ monthKey, monthLabel, aiHoro, headline: hsHeadline }),
      'utf8'
    )
  }
  await writeFile(
    path.join(outDir, `${fileKey}-monthly-horoscope-${locale}.meta.json`),
    (() => {
      const fallbackTitle = locale === 'en'
        ? `Monthly forecast — ${monthLabel}`
        : `Прогноз на месяц — ${monthLabel}`
      return JSON.stringify({
        monthKey, locale, signs: ZODIAC_SIGNS.map((z) => z.key),
        youtubeTitle: `${aiHoro?.title || hsHeadline || fallbackTitle} #Shorts`,
      })
    })(),
    'utf8'
  )

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
  console.log(JSON.stringify({ video: outVideo, locale, duration: totalDuration }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
