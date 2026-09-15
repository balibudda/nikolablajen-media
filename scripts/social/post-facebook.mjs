// Publishes today's already-rendered video to a Facebook Page via the Graph
// API (added 2026-09-05 — Nick found a real Facebook app + two Pages: "Bule
// Javan" for RU, "nikolablajen.en" for EN, App ID 1544731686843886). Mirrors
// post-instagram.mjs's file-lookup pattern (same dist-social dir, same
// --suffix convention) so every pipeline that already has an "Post to
// Instagram" step can get a "Post to Facebook" step for free.
//
// Unlike Instagram, Facebook actually renders a plain https:// URL in post
// text as a real clickable link (Nick's explicit ask: "ссылка в конце
// всегда ставь - она там читабельна"), and has no IG-style caption cap — so
// this script uses the FULLEST available caption (.caption.txt, the
// VK/YouTube-oriented one, not the IG-trimmed .caption-ig.txt) and always
// appends a real link at the end if the caption doesn't already carry one:
// meta.json's `moreUrl` field when the pipeline wrote one, else the site
// homepage.
//
// Usage: node scripts/social/post-facebook.mjs [--locale=ru|en] [--dir=dist-social] [--suffix=name] [--force]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadTempAsset, deleteTempAsset } from './github-asset-host.mjs'
import { wasPosted, markPosted } from './posted-marker.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const API_VERSION = 'v21.0'

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function readIfExists(p) {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

// Nick, 2026-09-05, live screenshot feedback on the very first real post:
// the fallback link landed AFTER the hashtag block at the very end — put it
// right before the hashtags instead, so it reads like part of the post, not
// an afterthought tacked on past the tags.
function insertLinkBeforeHashtags(caption, linkLine) {
  const lines = caption.split('\n')
  let i = lines.length - 1
  while (i >= 0 && lines[i].trim() === '') i--
  const isHashtagLine = i >= 0 && /^#\S+(\s+#\S+)*$/.test(lines[i].trim())
  if (!isHashtagLine) return `${caption.trimEnd()}\n\n${linkLine}`
  // Insert right before the hashtag line, keeping its existing blank-line
  // separator above it: [...footer, blank, LINK, blank, #hashtags].
  lines.splice(i, 0, linkLine, '')
  return lines.join('\n')
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' || (typeof args.suffix === 'string' && args.suffix.endsWith('-en')) ? 'en' : 'ru'
  const suffix = args.suffix || locale
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  // --date=YYYY-MM-DD lets a recovery run point at an already-rendered
  // day's files instead of today's (e.g. reposting a day whose Facebook
  // leg failed on an invalidated token while every other channel succeeded).
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()

  const pageId = process.env.FB_PAGE_ID
  const token = process.env.FB_PAGE_TOKEN
  if (!pageId || !token) {
    console.error('FB_PAGE_ID / FB_PAGE_TOKEN not set — skipping post.')
    process.exit(1)
  }
  if (!process.env.GH_ASSETS_TOKEN) {
    console.error('GH_ASSETS_TOKEN not set — cannot host the video for Facebook to fetch.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-facebook`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (pass --force to override)`)
    process.exit(0)
  }

  const base = path.join(dir, `${dateKey}-${suffix}`)
  let caption = (await readIfExists(`${base}.caption.txt`)) ?? (await readIfExists(`${base}.caption-ig.txt`))
  if (caption == null) throw new Error(`no caption file found for ${base}`)

  let meta = null
  try {
    meta = JSON.parse(await readFile(`${base}.meta.json`, 'utf8'))
  } catch {
    // fine — not every pipeline writes one
  }
  const link = meta?.moreUrl || (locale === 'en' ? 'https://nikolablajen.ru/en/' : 'https://nikolablajen.ru/')
  if (!/https?:\/\//.test(caption)) {
    caption = insertLinkBeforeHashtags(caption, `🔗 ${link}`)
  }

  const videoBuf = await readFile(`${base}.mp4`)

  console.log('Uploading video to GitHub (temp asset)…')
  const { url: videoUrl, assetId } = await uploadTempAsset(videoBuf, `fb-${dateKey}-${suffix}.mp4`, 'video/mp4')
  console.log('Video URL:', videoUrl)

  try {
    console.log('Posting to Facebook Page…')
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${pageId}/videos`, {
      method: 'POST',
      body: new URLSearchParams({ file_url: videoUrl, description: caption, access_token: token }),
    })
    const body = await res.json()
    if (!body.id) throw new Error(`Facebook video post failed: ${JSON.stringify(body)}`)
    console.log('Published:', JSON.stringify(body, null, 2))
    await markPosted(tag)
  } finally {
    await deleteTempAsset(assetId)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
