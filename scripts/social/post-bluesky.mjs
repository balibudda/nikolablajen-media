// Publishes today's already-rendered video to Bluesky (AT Protocol), added
// 2026-09-05. EN only for now (Nick: "давай оба на английском... посмотрим
// как пойдёт" — Bluesky's audience is overwhelmingly English-speaking, a
// Russian post there would reach almost nobody; add RU later only if this
// channel proves worth it). Single account, @nikolablajen.bsky.social —
// BLUESKY_HANDLE / BLUESKY_APP_PASSWORD (an App Password, Settings →
// Privacy and Security → App Passwords — NOT the real account password).
//
// Unlike every other poster here, this is a genuine multi-step,
// push-the-bytes-yourself flow, not a "give me a URL and I'll fetch it"
// pattern:
//   1. com.atproto.server.createSession — log in fresh every run (an App
//      Password itself doesn't expire, so there's no refresh-token
//      bookkeeping to persist between runs).
//   2. com.atproto.server.getServiceAuth — mint a short-lived token scoped
//      to the separate video service (video.bsky.app runs its own auth).
//   3. POST the raw mp4 bytes to app.bsky.video.uploadVideo, then poll
//      getJobStatus until the video finishes processing into a blob.
//   4. com.atproto.repo.createRecord — the actual post, embedding that
//      blob as an app.bsky.embed.video.
// Limits (2026): 100MB / 3min per video, MP4 only, account email must be
// verified. Post text itself is capped at 300 graphemes — far shorter
// than every other channel's caption, so this builds its own short text
// rather than reusing .caption.txt verbatim.
//
// Usage: node scripts/social/post-bluesky.mjs [--dir=dist-social] [--suffix=name] [--force]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const PDS = 'https://bsky.social'
const VIDEO_SERVICE = 'https://video.bsky.app'
const POST_LIMIT = 300 // graphemes, not bytes — see buildThreadChunks()

// The service-auth token's `aud` for video upload must be the user's OWN
// PDS's service DID (did:web:<pds-hostname>), NOT video.bsky.app's own DID
// — confirmed live 2026-09-05 via the API's own error message when this
// was first guessed wrong ("should be the user's PDS DID..."). Every
// account can live on a different PDS host, so this has to be resolved
// per-account at runtime, not hardcoded.
async function resolvePdsDid(did) {
  const url = did.startsWith('did:plc:') ? `https://plc.directory/${did}` : `https://${did.replace('did:web:', '')}/.well-known/did.json`
  const doc = await (await fetch(url)).json()
  const pds = (doc.service || []).find((s) => s.id === '#atproto_pds')
  if (!pds) throw new Error(`no #atproto_pds service found in DID document for ${did}`)
  return `did:web:${new URL(pds.serviceEndpoint).hostname}`
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Bluesky's 300-cap is in grapheme clusters, not JS string length or bytes
// — emoji/Cyrillic don't matter here since this channel is EN-only text,
// but Intl.Segmenter is the correct tool regardless of script.
function graphemeLength(s) {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
  return [...seg.segment(s)].length
}
// Nick, 2026-09-05, live feedback: wants "полноценные тексты как в инсте"
// (full text, same as Instagram) on Bluesky too — but Bluesky's 300-
// grapheme cap is a real, hard platform limit, not a style choice, so the
// only way to carry the FULL caption (not a trimmed hook) is a thread:
// the video goes on the root post, the rest of the caption is split into
// reply posts, with the link guaranteed on the very last one.
const MAX_THREAD_POSTS = 6
function buildThreadChunks(caption, link) {
  const CHUNK_LIMIT = 290 // headroom under the real 300 cap
  const body = caption.replace(/#[^\s#]+/g, '').trim() // hashtags don't carry across a thread the way one caption does — drop them
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks = []
  let current = ''
  const flush = () => { if (current) { chunks.push(current); current = '' } }
  // Adds `piece` to the current chunk if it fits; otherwise flushes and, if
  // piece alone still exceeds the limit (no punctuation to split on — e.g.
  // one long clause with no . ! ?), hard-wraps it word by word as a last
  // resort so a chunk can never exceed CHUNK_LIMIT (found live 2026-09-16:
  // a 335-grapheme chunk reached Bluesky's API because the old
  // sentence-split fallback assigned an oversized "sentence" to `current`
  // unconditionally, with nothing after it to catch that case).
  const addPiece = (piece) => {
    const candidate = current ? `${current} ${piece}` : piece
    if (graphemeLength(candidate) <= CHUNK_LIMIT) { current = candidate; return }
    flush()
    if (graphemeLength(piece) <= CHUNK_LIMIT) { current = piece; return }
    for (const word of piece.split(/\s+/)) {
      const cand2 = current ? `${current} ${word}` : word
      if (graphemeLength(cand2) <= CHUNK_LIMIT) current = cand2
      else { flush(); current = word }
    }
  }
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para
    if (graphemeLength(candidate) <= CHUNK_LIMIT) {
      current = candidate
      continue
    }
    flush()
    if (graphemeLength(para) <= CHUNK_LIMIT) {
      current = para
      continue
    }
    // paragraph itself is too long — split at sentence boundaries
    for (const s of para.split(/(?<=[.!?])\s+/)) addPiece(s)
  }
  flush()
  if (chunks.length === 0) chunks.push('')
  const withLink = `${chunks[chunks.length - 1]}\n\n${link}`
  if (graphemeLength(withLink) <= CHUNK_LIMIT) chunks[chunks.length - 1] = withLink
  else chunks.push(link)
  if (chunks.length > MAX_THREAD_POSTS) {
    return [...chunks.slice(0, MAX_THREAD_POSTS - 1), link]
  }
  return chunks
}

// AT Protocol facets are byte-range (UTF-8), not JS string-index — build
// the link facet the same way the official docs' example does.
function linkFacet(text, url) {
  const idx = text.indexOf(url)
  if (idx === -1) return []
  const enc = new TextEncoder()
  const byteStart = enc.encode(text.slice(0, idx)).length
  const byteEnd = byteStart + enc.encode(url).length
  return [{
    index: { byteStart, byteEnd },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
  }]
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

  const handle = process.env.BLUESKY_HANDLE
  const appPassword = process.env.BLUESKY_APP_PASSWORD
  if (!handle || !appPassword) {
    console.error('BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set — skipping post.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-bluesky`
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
  const chunks = buildThreadChunks(caption, link)
  const videoBuf = await readFile(`${base}.mp4`)
  if (videoBuf.length > 100 * 1024 * 1024) throw new Error(`video too large for Bluesky: ${videoBuf.length} bytes (100MB limit)`)

  console.log('Logging in to Bluesky…')
  const sessionRes = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  })
  const session = await sessionRes.json()
  if (!session.accessJwt) throw new Error(`Bluesky login failed: ${JSON.stringify(session)}`)

  console.log('Requesting video-service auth…')
  const pdsDid = await resolvePdsDid(session.did)
  const authRes = await fetch(
    `${PDS}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(pdsDid)}&lxm=com.atproto.repo.uploadBlob`,
    { headers: { Authorization: `Bearer ${session.accessJwt}` } }
  )
  const serviceAuth = await authRes.json()
  if (!serviceAuth.token) throw new Error(`Bluesky getServiceAuth failed: ${JSON.stringify(serviceAuth)}`)

  console.log('Uploading video…')
  const videoName = `${dateKey}-${suffix}.mp4`
  const uploadRes = await fetch(
    `${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(session.did)}&name=${encodeURIComponent(videoName)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceAuth.token}`, 'Content-Type': 'video/mp4' },
      body: videoBuf,
    }
  )
  const upload = await uploadRes.json()
  if (!upload.jobId) throw new Error(`Bluesky video upload failed: ${JSON.stringify(upload)}`)

  console.log('Waiting for video processing…')
  let job = upload
  for (let i = 0; i < 30 && job.state !== 'JOB_STATE_COMPLETED' && job.state !== 'JOB_STATE_FAILED'; i++) {
    await sleep(5000)
    const jobRes = await fetch(`${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?jobId=${upload.jobId}`)
    job = (await jobRes.json()).jobStatus || (await jobRes.json())
  }
  if (job.state !== 'JOB_STATE_COMPLETED' || !job.blob) {
    throw new Error(`Bluesky video processing did not complete: ${JSON.stringify(job)}`)
  }

  console.log(`Publishing thread (${chunks.length} post${chunks.length > 1 ? 's' : ''})…`)
  async function createPost(record) {
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
    })
    const post = await res.json()
    if (!post.uri) throw new Error(`Bluesky post failed: ${JSON.stringify(post)}`)
    return post
  }

  const rootRecord = {
    $type: 'app.bsky.feed.post',
    text: chunks[0],
    createdAt: new Date().toISOString(),
    facets: linkFacet(chunks[0], link),
    embed: { $type: 'app.bsky.embed.video', video: job.blob, alt: caption.split('\n')[0].slice(0, 200) },
  }
  const rootPost = await createPost(rootRecord)
  const rootRef = { uri: rootPost.uri, cid: rootPost.cid }
  let parentRef = rootRef
  for (const chunk of chunks.slice(1)) {
    const replyRecord = {
      $type: 'app.bsky.feed.post',
      text: chunk,
      createdAt: new Date().toISOString(),
      facets: linkFacet(chunk, link),
      reply: { root: rootRef, parent: parentRef },
    }
    const replyPost = await createPost(replyRecord)
    parentRef = { uri: replyPost.uri, cid: replyPost.cid }
  }
  console.log('Published:', JSON.stringify(rootPost, null, 2))
  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
