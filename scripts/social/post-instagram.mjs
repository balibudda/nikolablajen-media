// Publishes today's already-rendered "card of the day" video as an Instagram
// Reel via the Graph API. Needs IG_ACCESS_TOKEN + IG_USER_ID (see README in
// this folder for how to obtain them) and GH_ASSETS_TOKEN (the Graph API
// only accepts a video by URL, not by direct upload, for the container-based
// Reels flow — see github-asset-host.mjs for why this hosts the temp file on
// GitHub instead of Vercel Blob as of 2026-09-08).
//
// Usage: node scripts/social/post-instagram.mjs [--locale=ru|en] [--dir=dist-social] [--suffix=name]
// --suffix overrides the file-lookup/posted-marker suffix (default: locale)
// without changing any locale-driven behavior — added 2026-08-31 so the
// separate daily Tarot post (generate-video-tarot.mjs, files named
// `<date>-tarot.*`) can reuse this same script instead of a duplicate.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadTempAsset, deleteTempAsset } from './github-asset-host.mjs'
import { wasPosted, markPosted } from './posted-marker.mjs'
import { mirrorEnCaption } from './tg-en-mirror.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0'
// We publish through the Instagram Login API (graph.instagram.com), not the
// Facebook-Page-linked flow (graph.facebook.com) — @bulejavan is a standalone
// professional account with no Facebook Page. Same endpoint shapes
// (/{ig-user-id}/media, /{ig-user-id}/media_publish, /{container-id}?fields=status_code),
// just a different host and an IGAA… user token instead of a page token.
const GRAPH_HOST = process.env.GRAPH_HOST || 'graph.instagram.com'

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function graph(pathSegment, params, method = 'GET') {
  const url = new URL(`https://${GRAPH_HOST}/${API_VERSION}/${pathSegment}`)
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url)
    const body = await res.json()
    if (!res.ok) throw new Error(`Graph API GET ${pathSegment} failed: ${JSON.stringify(body)}`)
    return body
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Graph API POST ${pathSegment} failed: ${JSON.stringify(body)}`)
  return body
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Instagram EN (@nikolablajen.en) killed 2026-09-14 — Nick, plainly: "толку
// нет, просмотров нет, ничего там не дает. зачем плодить контент там где
// отклика нет." He wants the RU audience to be the actual focus going
// forward, not English. Same single-choke-point pattern as
// YOUTUBE_EN_DISABLED in post-youtube.mjs and THREADS_DISABLED in
// post-threads.mjs — covers every pipeline that calls this script
// (daily card, tarot, pickcard ×3, message-spread, monthly horoscope,
// astro-event, section posts, custom broadcasts) in one place. RU
// (@bulejavan) is untouched. Remove this flag to re-enable.
const INSTAGRAM_EN_DISABLED = true

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  // Most callers pass --suffix=<name>-en (pickcard, tarot, message-spread,
  // horoscope video, etc.) without ever passing --locale — this variable
  // sat unused before the EN-caption-mirror feature below, so nothing
  // depended on it being right. Fall back to sniffing the suffix so the
  // mirror actually fires for those callers too (caught live 2026-09-05:
  // an EN pickcard-mak post published fine but never mirrored, because
  // `locale` silently defaulted to 'ru').
  const locale = args.locale === 'en' || (typeof args.suffix === 'string' && args.suffix.endsWith('-en')) ? 'en' : 'ru'
  if (INSTAGRAM_EN_DISABLED && locale === 'en') {
    console.log('Instagram EN (@nikolablajen.en) posting is disabled (Nick, 2026-09-14 — no views/no traffic) — skipping. Remove INSTAGRAM_EN_DISABLED in post-instagram.mjs to re-enable.')
    return
  }
  const suffix = args.suffix || locale
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const dateKey = getTodayKey()

  const accessToken = process.env.IG_ACCESS_TOKEN
  const igUserId = process.env.IG_USER_ID
  if (!accessToken || !igUserId) {
    console.error('IG_ACCESS_TOKEN / IG_USER_ID not set — see scripts/social/README.md. Skipping post.')
    process.exit(1)
  }
  if (!process.env.GH_ASSETS_TOKEN) {
    console.error('GH_ASSETS_TOKEN not set — cannot host the video for Instagram to fetch.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-instagram`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (pass --force to override)`)
    process.exit(0)
  }

  const videoPath = path.join(dir, `${dateKey}-${suffix}.mp4`)
  // Prefer the Instagram-sized caption (its own 2200 cap); fall back to the
  // shared .caption.txt for older runs / other pipelines that don't emit one.
  let caption
  try {
    caption = await readFile(path.join(dir, `${dateKey}-${suffix}.caption-ig.txt`), 'utf8')
  } catch {
    caption = await readFile(path.join(dir, `${dateKey}-${suffix}.caption.txt`), 'utf8')
  }
  const videoBuf = await readFile(videoPath)

  console.log('Uploading video to GitHub (temp asset)…')
  const { url: videoUrl, assetId } = await uploadTempAsset(videoBuf, `${dateKey}-${suffix}-ig.mp4`, 'video/mp4')
  console.log('Video URL:', videoUrl)

  try {
    console.log('Creating Instagram media container…')
    const container = await graph(
      `${igUserId}/media`,
      {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: accessToken,
      },
      'POST'
    )

    console.log('Container created:', container.id, '— waiting for processing…')
    let status = 'IN_PROGRESS'
    for (let attempt = 0; attempt < 20 && status === 'IN_PROGRESS'; attempt++) {
      await sleep(15000)
      const check = await graph(container.id, { fields: 'status_code', access_token: accessToken })
      status = check.status_code
      console.log(`  status: ${status} (attempt ${attempt + 1})`)
    }
    if (status !== 'FINISHED') {
      throw new Error(`Container never finished processing (last status: ${status})`)
    }

    console.log('Publishing…')
    const published = await graph(
      `${igUserId}/media_publish`,
      { creation_id: container.id, access_token: accessToken },
      'POST'
    )
    console.log('Published:', JSON.stringify(published, null, 2))
    await markPosted(tag)
    if (locale === 'en') await mirrorEnCaption(caption)
  } finally {
    await deleteTempAsset(assetId)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
