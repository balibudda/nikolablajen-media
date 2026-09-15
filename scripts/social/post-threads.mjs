// Publishes today's rendered "card of the day" video to Threads (the daily
// pipeline). Needed because Instagram's in-app "share to Threads" toggle
// does NOT carry Reels published via the API. Threads API, same Meta app as
// the IG Login flow. Needs THREADS_ACCESS_TOKEN + THREADS_USER_ID (per
// language the workflow injects the right one) and GH_ASSETS_TOKEN
// (Threads takes a video by URL, not a file).
//
// Flow: upload the mp4 to GitHub (github-asset-host.mjs) -> create a VIDEO
// container -> poll status -> publish. Threads text limit is 500 chars, so
// the caption is a compact header + closing quote + link, not the full IG
// caption.
//
// Usage: node scripts/social/post-threads.mjs [--locale=ru|en] [--dir=dist-social] [--force] [--suffix=name]
// --suffix overrides the file-lookup/posted-marker suffix (default: locale)
// — added 2026-08-31 for the daily Tarot post's `<date>-tarot.*` files.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadTempAsset, deleteTempAsset } from './github-asset-host.mjs'
import { wasPosted, markPosted } from './posted-marker.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const API = 'https://graph.threads.net/v1.0'
const LIMIT = 490
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Compact caption for Threads' 500-char limit: the 🔮/✨ header, the closing
// «phrase of the day» if it fits, then the permanent card page link.
function threadsCaption(caption, locale, dateKey, meta) {
  const lines = caption.split('\n')
  const header = lines.slice(0, 2).join('\n') // 🔮 date  /  ✨ title — deck
  const quoteLine = lines.find((l) => l.startsWith('💬')) || ''
  // `moreUrl` is the explicit, pipeline-specific "learn more" link every
  // generate-video*.mjs script now writes into its own meta.json. Falling
  // back to the old deckKey/cardId card-page construction only when
  // `moreUrl` is missing (an older meta.json) keeps this working without
  // silently building "karta/undefined/undefined/" for pipelines that have
  // no single card at all — pick-a-card (3 cards) and the horoscope video
  // (12 signs) don't, and shipped with exactly that broken link until Nick
  // caught it live in the horoscope post, 2026-09-01.
  const url = meta.moreUrl
    || `https://nikolablajen.ru/blog/${locale === 'en' ? 'en/' : ''}karta/${meta.deckKey}/${meta.cardId}/`
  const link = locale === 'en' ? `📖 Full meaning: ${url}` : `📖 Полное значение: ${url}`
  let out = header
  if (quoteLine && (out.length + 2 + quoteLine.length + 2 + link.length) <= LIMIT) out += `\n\n${quoteLine}`
  out += `\n\n${link}`
  return out.length <= LIMIT ? out : `${header}\n\n${link}`.slice(0, LIMIT)
}

// Threads auto-posting is OFF (Nick, 2026-09-03): zero referral traffic,
// and it's a channel he'd rather post to by hand. This single early return
// disables every daily-pipeline Threads step (RU + EN, card/tarot/pickcard/
// horoscope) without editing each workflow. broadcast.mjs drops 'threads'
// separately, which also neutralises the "трендс личный" personal workflow.
// To re-enable: delete this block.
const THREADS_DISABLED = true

async function main() {
  if (THREADS_DISABLED) {
    console.log('Threads posting is disabled (Nick, 2026-09-03) — skipping. Remove THREADS_DISABLED in post-threads.mjs to re-enable.')
    return
  }
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const suffix = args.suffix || locale
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const dateKey = getTodayKey()

  const token = process.env.THREADS_ACCESS_TOKEN
  const userId = process.env.THREADS_USER_ID
  if (!token || !userId) {
    console.error('THREADS_ACCESS_TOKEN / THREADS_USER_ID not set — see scripts/social/README.md. Skipping.')
    process.exit(1)
  }
  if (!process.env.GH_ASSETS_TOKEN) {
    console.error('GH_ASSETS_TOKEN not set — Threads needs a public video URL.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-threads`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (--force to override)`)
    process.exit(0)
  }

  const [videoBuf, caption, metaRaw] = await Promise.all([
    readFile(path.join(dir, `${dateKey}-${suffix}.mp4`)),
    readFile(path.join(dir, `${dateKey}-${suffix}.caption.txt`), 'utf8'),
    readFile(path.join(dir, `${dateKey}-${suffix}.meta.json`), 'utf8'),
  ])
  const meta = JSON.parse(metaRaw)
  const text = threadsCaption(caption, locale, dateKey, meta)

  console.log('Uploading video to GitHub (temp asset)…')
  const { url: videoUrl, assetId } = await uploadTempAsset(videoBuf, `threads-${dateKey}-${suffix}.mp4`, 'video/mp4')

  try {
    console.log('Creating Threads container…')
    const cRes = await fetch(`${API}/${userId}/threads`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'VIDEO', video_url: videoUrl, text, access_token: token }),
    })
    const container = await cRes.json()
    if (!container.id) throw new Error(`Threads container failed: ${JSON.stringify(container)}`)

    let status = 'IN_PROGRESS'
    for (let i = 0; i < 25 && status === 'IN_PROGRESS'; i++) {
      await sleep(12000)
      const chk = await (await fetch(`${API}/${container.id}?fields=status,error_message&access_token=${token}`)).json()
      status = chk.status
      console.log(`  status: ${status} (attempt ${i + 1})`)
      if (status === 'ERROR') throw new Error(`Threads processing error: ${JSON.stringify(chk)}`)
    }
    if (status !== 'FINISHED') throw new Error(`Threads container never finished (last: ${status})`)

    console.log('Publishing…')
    const pRes = await fetch(`${API}/${userId}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    })
    const pub = await pRes.json()
    if (!pub.id) throw new Error(`Threads publish failed: ${JSON.stringify(pub)}`)

    console.log(`Posted: threads media ${pub.id}`)
    await markPosted(tag)
  } finally {
    await deleteTempAsset(assetId)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
