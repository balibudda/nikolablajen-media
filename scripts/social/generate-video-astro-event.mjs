// Event-based content: a "heads up" video about a real upcoming
// astronomical/astrological event (Mercury retrograde, an eclipse
// corridor), posted BEFORE it starts to ride the search spike (BACKLOG.md
// "Building now", 2026-09-05 — Studio's own pitch: "Коридор затмений —
// самый мощный поисковый тренд. Сделав видео заранее, вы попадёте в
// поисковую волну"). Real dates only — see astro-events.mjs's sources.
//
// Single segment (not the intro/card/outro concat pattern the other new
// formats use) — this content isn't card-anchored, it's one continuous
// "here's what's coming and what it means" narration, closer in shape to
// the daily card-of-day video than to pick-a-card.
//
// Usage: node scripts/social/generate-video-astro-event.mjs [--locale=ru|en] [--out=dir] [--lookahead=21] [--event=<id>]
// --event forces a specific ASTRO_EVENTS id regardless of today's date —
// needed for testing (the real calendar has real gaps between events; you
// can't just wait for one to fall inside the default lookahead window).
import { execFile } from 'node:child_process'
import { writeFile, mkdir, readFile, unlink, appendFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickHashtags } from './hashtags.mjs'
import { ASTRO_EVENTS, nextUpcomingEvent } from './astro-events.mjs'
import { wasPosted, markPosted } from './posted-marker.mjs'

// Tells the calling GitHub Actions step whether there's anything to post
// this run — every downstream "Post to X" step is gated on this (see
// astro-event-post.yml), since the resolved event id isn't known until
// this script runs. Also how the weekly cron avoids re-posting the SAME
// event every week it happens to still be within --lookahead days (see
// the per-event `wasPosted` check below — this is keyed by event id, not
// by date, on purpose).
async function writeGithubOutput(fields) {
  const outFile = process.env.GITHUB_OUTPUT
  if (!outFile) return
  await appendFile(outFile, Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', 'utf8')
}

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const WATERMARK = 'nikolablajen.ru'
const fontDir = path.join(__dirname, 'fonts')
const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function humanDate(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number)
  return locale === 'en' ? `${MONTHS_EN[m - 1]} ${d}` : `${d} ${MONTHS_RU[m - 1]}`
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
    chunks.push({ text: slice.map((w) => w.word.trim()).join(' '), start: slice[0].start, end: slice[slice.length - 1].end })
  }
  return chunks
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })
  const lookahead = args.lookahead ? Number(args.lookahead) : 21

  const event = typeof args.event === 'string'
    ? ASTRO_EVENTS.find((e) => e.id === args.event)
    : nextUpcomingEvent(new Date(), lookahead)
  if (!event) {
    console.log(`::warning::no astro event within ${lookahead} days — nothing to post. Pass --event=<id> to force one for testing.`)
    await writeGithubOutput({ found: 'false' })
    return
  }
  // A weekly check will see the SAME upcoming event on several consecutive
  // runs if it stays inside the lookahead window — only post about any
  // given event once, ever, per language. Manual --event= testing still
  // goes through this (harmless: --force on the individual post-*.mjs
  // scripts isn't needed here since this is a separate, event-id-keyed
  // marker, not the per-day posted-marker each post-*.mjs script uses).
  const notifyTag = `astro-notified-${event.id}-${locale}`
  if (!args.force && (await wasPosted(notifyTag))) {
    console.log(`already posted about ${event.id} (${locale}) — skipping. Pass --force to override.`)
    await writeGithubOutput({ found: 'false' })
    return
  }
  const dateKey = getTodayKey()

  const title = event.title[locale]
  const blurb = event.blurb[locale]
  const dateRange = event.end && event.end !== event.start
    ? `${humanDate(event.start, locale)}${locale === 'en' ? ' – ' : ' – '}${humanDate(event.end, locale)}`
    : humanDate(event.start, locale)
  const narrationText = blurb

  const gradientPath = path.join(outDir, `ae-gradient-${dateKey}-${locale}.jpg`)
  await run('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=1080x1920:c0=0x0a0a16:c1=0x1c1730:x0=540:y0=300:x1=540:y1=1920',
    '-frames:v', '1', gradientPath,
  ])

  const audioPath = path.join(outDir, `ae-audio-${dateKey}-${locale}.mp3`)
  const narrated = await synthesizeSpeech(narrationText, audioPath)
  let audioFile = narrated
  let audioDuration = narrated ? await probeDurationSeconds(narrated) : 0
  const words = narrated ? await getWordTimestamps(narrated, locale) : null
  if (!audioFile) {
    audioDuration = Math.max(4, Math.ceil(narrationText.length / 14))
    audioFile = path.join(outDir, `ae-silence-${dateKey}-${locale}.mp3`)
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(audioDuration), '-q:a', '9', audioFile])
  }
  const duration = Math.max(4, Math.ceil(audioDuration + 1))
  const fps = 30

  const headerFile = path.join(outDir, `ae-header-${dateKey}-${locale}.txt`)
  await writeFile(headerFile, [title, dateRange].join('\n'), 'utf8')
  const filterParts = [
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`,
    `drawbox=x=0:y=0:w=1080:h=440:color=black@0.45:t=fill`,
    `drawtext=fontfile=${boldFont}:textfile=${headerFile}:fontcolor=0xE8D5A8:fontsize=60:line_spacing=18:x=(w-text_w)/2:y=150:box=0`,
    `drawbox=x=0:y=1400:w=1080:h=520:color=black@0.55:t=fill`,
  ]
  if (words && words.length) {
    const chunks = chunkWords(words, 4)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const lines = wrapText(chunk.text, 26)
      const chunkFile = path.join(outDir, `ae-cap-${dateKey}-${locale}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=48:line_spacing=14:x=(w-text_w)/2:y=1450:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else {
    const capFile = path.join(outDir, `ae-caption-${dateKey}-${locale}.txt`)
    await writeFile(capFile, wrapText(narrationText, 30).join('\n'), 'utf8')
    filterParts.push(`drawtext=fontfile=${regularFont}:textfile=${capFile}:fontcolor=0xEDE5D4:fontsize=42:line_spacing=12:x=(w-text_w)/2:y=1450:box=0`)
  }
  filterParts.push(`drawtext=fontfile=${regularFont}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=26:x=(w-text_w)/2:y=h-50:box=0`)

  const outVideo = path.join(outDir, `${dateKey}-astro-${event.id}-${locale}.mp4`)
  await run('ffmpeg', [
    '-y', '-loop', '1', '-i', gradientPath, '-i', audioFile,
    '-t', String(duration), '-vf', filterParts.join(','),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-shortest', '-map', '0:v', '-map', '1:a',
    outVideo,
  ])
  await unlink(gradientPath).catch(() => {})

  const tags = pickHashtags(`${dateKey}|astro|${event.id}`, locale, null, 14)
  const link = locale === 'en' ? 'https://nikolablajen.ru/en/' : 'https://nikolablajen.ru/'
  const cta = locale === 'en'
    ? `Read the full picture for your sign — free daily horoscope and card of the day in the Nikola Blajen app.`
    : `Полную картину по своему знаку — бесплатный ежедневный гороскоп и карта дня в приложении «Никола Блажен».`
  const caption = [`🔮 ${title} · ${dateRange}`, '', blurb, '', cta, link, '', tags].join('\n')
  await writeFile(path.join(outDir, `${dateKey}-astro-${event.id}-${locale}.caption.txt`), caption, 'utf8')
  const tiktokTags = pickHashtags(`${dateKey}|astro|${event.id}|tt`, locale, null, 5)
  await writeFile(path.join(outDir, `${dateKey}-astro-${event.id}-${locale}.tiktok.txt`), [`🔮 ${title} · ${dateRange}`, '', cta, '', tiktokTags].join('\n'), 'utf8')
  if (locale === 'ru') {
    const tgLink = `<a href="${link}">nikolablajen.ru</a>`
    await writeFile(
      path.join(outDir, `${dateKey}-astro-${event.id}-ru.telegram.txt`),
      [`🔮 <b>${title} · ${dateRange}</b>`, '', blurb, '', cta.replace('nikolablajen.ru', ''), tgLink, '', tags].join('\n'),
      'utf8'
    )
  }
  await writeFile(
    path.join(outDir, `${dateKey}-astro-${event.id}-${locale}.meta.json`),
    JSON.stringify({
      dateKey, locale, eventId: event.id,
      youtubeTitle: `${title} — ${dateRange} #Shorts`,
      moreUrl: link,
    }),
    'utf8'
  )

  await markPosted(notifyTag)
  await writeGithubOutput({ found: 'true', event_id: event.id })
  console.log(JSON.stringify({ video: outVideo, event: event.id, title, dateRange, duration }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
