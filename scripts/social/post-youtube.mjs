// Uploads today's rendered "card of the day" video to YouTube as a Short
// (RU only). Needs YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN
// (Desktop OAuth client, scope youtube.upload, consent screen published so
// the refresh token doesn't expire). See scripts/social/README.md.
//
// Flow: refresh the access token -> start a resumable upload (snippet +
// status) -> PUT the file bytes -> the video is published public.
//
// Usage: node scripts/social/post-youtube.mjs [--dir=dist-social] [--locale=ru|en] [--suffix=name]
// --suffix overrides the file-lookup/posted-marker suffix (default: locale)
// — added 2026-08-31 for the daily Tarot post's `<date>-tarot.*` files.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID,
      client_secret: process.env.YT_CLIENT_SECRET,
      refresh_token: process.env.YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`YouTube token refresh failed: ${JSON.stringify(json)}`)
  return json.access_token
}

// YouTube EN (@balibudda) killed 2026-09-14 — Nick, plainly: "просмотров
// все равно нет, удалю канал - смысла в нем нет... зачем плодить контент
// там где отклика нет." He's deleting the channel himself; this stops
// every pipeline (daily card, tarot, pickcard ×3, message-spread, monthly
// horoscope, astro-event, section posts, custom broadcasts) from trying to
// upload to it, in one place, same pattern as THREADS_DISABLED in
// post-threads.mjs. Checked on `locale`, computed the same way as
// post-instagram.mjs (explicit --locale=en OR a --suffix ending in -en),
// so it fires regardless of which flag a given workflow happens to pass.
// RU (@nikolablajen) is untouched. Remove this block to re-enable.
const YOUTUBE_EN_DISABLED = true

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' || (typeof args.suffix === 'string' && args.suffix.endsWith('-en')) ? 'en' : 'ru'
  if (YOUTUBE_EN_DISABLED && locale === 'en') {
    console.log('YouTube EN posting is disabled (Nick, 2026-09-14 — no views, channel being deleted) — skipping. Remove YOUTUBE_EN_DISABLED in post-youtube.mjs to re-enable.')
    return
  }
  const suffix = args.suffix || locale
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const dateKey = getTodayKey()

  const tag = `${dateKey}-${suffix}-youtube`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (--force to override)`)
    process.exit(0)
  }

  if (!process.env.YT_CLIENT_ID || !process.env.YT_CLIENT_SECRET || !process.env.YT_REFRESH_TOKEN) {
    console.error('YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN not set — see scripts/social/README.md. Skipping.')
    process.exit(1)
  }

  const [videoBuf, caption, metaRaw] = await Promise.all([
    readFile(path.join(dir, `${dateKey}-${suffix}.mp4`)),
    readFile(path.join(dir, `${dateKey}-${suffix}.caption.txt`), 'utf8'),
    readFile(path.join(dir, `${dateKey}-${suffix}.meta.json`), 'utf8'),
  ])
  const meta = JSON.parse(metaRaw)

  const [, m, d] = dateKey.split('-')
  // Prefer a ready-made title from the generator's meta.json — the horoscope
  // and pick-a-card pipelines have no single card, so the old
  // «${meta.title}» — ${meta.deckTitle} template produced literal
  // «undefined» — undefined and a wrong "Карта дня" prefix (Nick caught it
  // live 2026-09-03). Only the daily-card + Tarot metas carry title/deckTitle.
  let title = meta.youtubeTitle
  if (!title && meta.title && meta.deckTitle) {
    title = locale === 'en'
      ? `Card of the day, ${d}.${m} · “${meta.title}” — ${meta.deckTitle} #Shorts`
      : `Карта дня, ${d}.${m} · «${meta.title}» — ${meta.deckTitle} #Shorts`
  }
  if (!title) {
    // Last resort: first non-empty caption line, so a missing meta field can
    // never again ship an "undefined" title.
    title = (caption.split('\n').find((l) => l.trim()) || 'Никола Блажен').trim()
    if (!/#shorts/i.test(title)) title += ' #Shorts'
  }
  if (title.length > 100) title = title.slice(0, 96) + '…'
  // YouTube descriptions DO render clickable links (unlike IG/TikTok, where
  // Nick had bare URLs stripped 2026-09-03). He asked 2026-09-04 to put the
  // site link back specifically on YouTube. `moreUrl` is written by every
  // generate-video*.mjs into meta.json.
  const linkLine = meta?.moreUrl && !caption.includes(meta.moreUrl)
    ? `\n\n${locale === 'en' ? '📖 Full text' : '📖 Полный текст'}: ${meta.moreUrl}`
    : ''
  const withLink = caption + linkLine
  const description = /#shorts/i.test(withLink) ? withLink : `${withLink}\n\n#Shorts`
  const tags = Array.from(
    new Set((caption.match(/#([^\s#]+)/g) || []).map((t) => t.slice(1)))
  ).slice(0, 30)

  const token = await accessToken()

  console.log('YouTube: starting resumable upload…')
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBuf.length),
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId: '22' },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, madeForKids: false },
      }),
    }
  )
  if (!init.ok) throw new Error(`YouTube init failed: ${init.status} ${await init.text()}`)
  const uploadUrl = init.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube init: no resumable upload URL returned')

  console.log('YouTube: uploading file…')
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuf.length) },
    body: videoBuf,
  })
  const body = await put.json()
  if (!put.ok || !body.id) throw new Error(`YouTube upload failed: ${put.status} ${JSON.stringify(body)}`)

  console.log(`Posted: https://youtube.com/shorts/${body.id}  (status: ${body.status?.uploadStatus})`)
  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
