// Daily-pipeline TikTok step — uploads today's already-rendered video to
// the TikTok inbox as a draft (video.upload/Content Posting API). Nick taps
// "Post" himself in the TikTok app; nothing here auto-publishes. RU by
// default; --locale=en posts to the second (EN) TikTok account instead —
// same TIKTOK_CLIENT_KEY/SECRET (one app, many accounts), separate
// TIKTOK_REFRESH_TOKEN_EN (see BACKLOG.md item Z).
//
// ON PRODUCTION since 2026-09-03. The Sandbox → Production migration is
// done: TIKTOK_CLIENT_KEY/SECRET hold the prod app's key/secret and both
// accounts were re-authorized against it (TIKTOK_REFRESH_TOKEN = RU
// @bulejavan, TIKTOK_REFRESH_TOKEN_EN = the EN account) via the
// "Admin — TikTok OAuth" workflow. TIKTOK_PROD_CLIENT_* /
// TIKTOK_SANDBOX_REFRESH_TOKEN are now just historical copies.
// Scope is `video.upload` — draft to inbox, Nick taps Post in the app.
// Auto-publish with an API caption needs `video.publish` (TikTok "Direct
// Post" audit), not requested yet.
//
// TikTok rotates the refresh_token on every use (the old one stops working
// once a new one is issued) — this script writes the new one straight back
// to the repo secret each run, same self-healing pattern as
// refresh-tokens.mjs, so nobody has to babysit it.
//
// Usage: node scripts/social/post-tiktok.mjs [--locale=ru|en] [--dir=dist-social] [--force] [--suffix=name]
// --suffix overrides the file-lookup/posted-marker suffix (default: locale),
// same additive convention as post-instagram.mjs etc., for reusing this
// script on a differently-named video stream (e.g. the Tarot pipeline).
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const API = 'https://open.tiktokapis.com/v2'
const REPO = 'balibudda/nikolablajen-media'

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function refreshToken(refreshTokenSecretName) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: process.env[refreshTokenSecretName],
  })
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`TikTok token refresh failed: ${JSON.stringify(data)}`)
  if (data.refresh_token) {
    try {
      await run('gh', ['secret', 'set', refreshTokenSecretName, '--repo', REPO, '--body', data.refresh_token])
    } catch (e) {
      console.error(`warning: failed to save rotated ${refreshTokenSecretName}`, e.message)
    }
  }
  return data.access_token
}

async function uploadToInbox(accessToken, buf) {
  const size = buf.length
  const initRes = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  })
  const init = await initRes.json()
  if (init.error?.code !== 'ok') throw new Error(`init failed: ${JSON.stringify(init)}`)
  const { publish_id: publishId, upload_url: uploadUrl } = init.data

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Range': `bytes 0-${size - 1}/${size}`,
    },
    body: buf,
  })
  if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status} ${await putRes.text()}`)
  return publishId
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const dateKey = getTodayKey()
  const locale = args.locale === 'en' ? 'en' : 'ru'
  const suffix = args.suffix || locale
  const refreshTokenVar = locale === 'en' ? 'TIKTOK_REFRESH_TOKEN_EN' : 'TIKTOK_REFRESH_TOKEN'

  for (const v of ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', refreshTokenVar]) {
    if (!process.env[v]) {
      console.error(`${v} not set — see scripts/social/README.md. Skipping.`)
      process.exit(1)
    }
  }

  // Default tag (date+suffix) is right for the daily pipelines, where
  // `suffix` alone (locale, or "tarot"/"tarot-en") already uniquely
  // identifies "today's one video" per stream. It's WRONG for promo-post.mjs
  // (razbor/sovet/zdorovie), whose `suffix` is only `promo<target>-<slot>` —
  // no slug in it — so two different queue entries posted in the same
  // slot on the same day collided on this exact tag and the second one's
  // TikTok upload was silently skipped as "already posted" even though it
  // was genuinely different content. Found live 2026-09-09 (razbor + zdorovie
  // hard-sell entries both landed in the "am" slot the same day as an
  // earlier post). `--tag=` lets a caller override with something content-
  // unique (promo-post.mjs now passes its own per-slug dedupe tag).
  const tag = args.tag ? `${args.tag}-tiktok` : `${dateKey}-${suffix}-tiktok`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (--force to override)`)
    process.exit(0)
  }

  const buf = await readFile(path.join(dir, `${dateKey}-${suffix}.mp4`))
  const accessToken = await refreshToken(refreshTokenVar)
  const publishId = await uploadToInbox(accessToken, buf)
  console.log(`✓ uploaded to TikTok inbox as draft, publish_id=${publishId}`)

  // The inbox/draft endpoint has no caption field at all — print the
  // purpose-built TikTok caption (5 hashtags, not 16 — see generate-
  // video.mjs's buildTikTokCaption) here so it's sitting in this step's own
  // log for Nick to copy-paste into the app, instead of him having to ask
  // for it separately every day.
  try {
    const caption = await readFile(path.join(dir, `${dateKey}-${suffix}.tiktok.txt`), 'utf8')
    console.log(`\n--- caption to paste in the TikTok app ---\n${caption}\n---`)
  } catch {
    console.log('(no *.tiktok.txt caption file found alongside the video)')
  }

  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
