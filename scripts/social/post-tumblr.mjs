// Publishes today's already-rendered video to Tumblr, added 2026-09-05.
// EN only for now (same reasoning as Bluesky — start on the one blog Nick
// made, add RU later only if it proves worth it). Blog: nikolablajen
// (tumblr.com/blog/nikolablajen).
//
// Two things found only by testing live, not from docs:
// 1. The NPF (Neue Post Format) endpoint — POST /v2/blog/{blog}/posts,
//    the one every current Tumblr API doc/example leads with — returned a
//    generic "Posting failed" (code 8001) for this app/blog on EVERY
//    attempt, text-only included, so it isn't a video-specific issue.
//    The LEGACY endpoint (POST /v2/blog/{blog}/post, singular) worked
//    immediately. Use the legacy one.
// 2. The legacy video post type needs the RAW FILE via multipart
//    (`data` field), not a hosted URL the way every other poster in this
//    repo works (Instagram/Facebook/YouTube all take a Blob URL) — a
//    `data`-as-URL or `embed` attempt was not tried further once the
//    direct-upload form worked live on the first try; Tumblr transcodes
//    it after upload (`state: "transcoding"` in the response, not
//    published immediately).
//
// Auth is OAuth2 (see tumblr-authorize.mjs for the one-time authorization
// pass). Access tokens are short-lived (~42 min) AND Tumblr rotates the
// refresh token on every single use (confirmed live — every refresh call
// during testing returned a new one) — this self-heals TUMBLR_REFRESH_TOKEN
// back to the repo secret every run via `gh secret set`, same pattern
// post-tiktok.mjs already uses for its own rotating refresh tokens.
//
// Usage: node scripts/social/post-tumblr.mjs [--dir=dist-social] [--suffix=name] [--force]
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const BLOG = process.env.TUMBLR_BLOG || 'nikolablajen'
const REPO = 'balibudda/nikolablajen-media'

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

async function refreshAccessToken() {
  const clientId = process.env.TUMBLR_CONSUMER_KEY
  const clientSecret = process.env.TUMBLR_CONSUMER_SECRET
  const refreshToken = process.env.TUMBLR_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('TUMBLR_CONSUMER_KEY / TUMBLR_CONSUMER_SECRET / TUMBLR_REFRESH_TOKEN not set')
  }
  const res = await fetch('https://api.tumblr.com/v2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Tumblr token refresh failed: ${JSON.stringify(data)}`)
  if (data.refresh_token) {
    try {
      await run('gh', ['secret', 'set', 'TUMBLR_REFRESH_TOKEN', '--repo', REPO, '--body', data.refresh_token])
    } catch (e) {
      console.error('warning: failed to save rotated TUMBLR_REFRESH_TOKEN', e.message)
    }
  }
  return data.access_token
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const suffix = args.suffix || 'en'
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const dateKey = getTodayKey()

  // --tag= override, same reasoning/fix as post-tiktok.mjs's own 2026-09-09
  // dedupe-collision note: the default date+suffix tag is right for the
  // daily pipelines but wrong for any future caller (e.g. promo-post.mjs)
  // whose `suffix` doesn't already uniquely identify the actual content.
  const tag = args.tag ? `${args.tag}-tumblr` : `${dateKey}-${suffix}-tumblr`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (pass --force to override)`)
    process.exit(0)
  }

  const base = path.join(dir, `${dateKey}-${suffix}`)
  const caption = (await readIfExists(`${base}.caption.txt`)) ?? (await readIfExists(`${base}.caption-ig.txt`))
  if (caption == null) throw new Error(`no caption file found for ${base}`)
  let meta = null
  try {
    meta = JSON.parse(await readFile(`${base}.meta.json`, 'utf8'))
  } catch {
    // fine — not every pipeline writes one
  }
  const link = meta?.moreUrl || 'https://nikolablajen.ru/en/'
  const fullCaption = /https?:\/\//.test(caption) ? caption : `${caption.trim()}\n\n${link}`
  const tags = (fullCaption.match(/#([^\s#]+)/g) || []).map((t) => t.slice(1)).slice(0, 20)
  const plainBody = fullCaption.replace(/#[^\s#]+/g, '').trim()
  // Tumblr's legacy `caption` field is HTML, not plain text — a bare
  // "\n\n" between paragraphs renders as one run-on block (Nick, live
  // screenshot feedback 2026-09-05: "там сплошной текст идет"). Wrap each
  // blank-line-separated paragraph in its own <p>.
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const captionBody = plainBody
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  const videoBuf = await readFile(`${base}.mp4`)

  console.log('Refreshing Tumblr access token…')
  const accessToken = await refreshAccessToken()

  console.log('Posting to Tumblr (legacy endpoint, direct video upload)…')
  const form = new FormData()
  form.set('type', 'video')
  form.set('caption', captionBody)
  form.set('tags', tags.join(','))
  form.set('data', new Blob([videoBuf], { type: 'video/mp4' }), `${dateKey}-${suffix}.mp4`)
  const res = await fetch(`https://api.tumblr.com/v2/blog/${BLOG}/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const post = await res.json()
  if (!post.response?.id) throw new Error(`Tumblr post failed: ${JSON.stringify(post)}`)
  console.log('Published:', JSON.stringify(post.response, null, 2))
  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
