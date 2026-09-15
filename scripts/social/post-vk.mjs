// Posts today's rendered "card of the day" video to a VK community wall
// (RU only). Needs VK_ACCESS_TOKEN (a user token for an admin of the group,
// scopes: video,wall,groups,offline — `offline` makes it non-expiring) and
// VK_GROUP_ID (the community's numeric id, no minus sign). See
// scripts/social/README.md for how to mint the token.
//
// Flow: video.save (registers the video on the group) -> POST the file to the
// returned upload_url -> wall.post with the video as an attachment.
//
// Usage: node scripts/social/post-vk.mjs [--dir=dist-social] [--suffix=ru]
// --suffix overrides the file-lookup/posted-marker suffix (default: 'ru',
// the only value this script ever used before) — added 2026-08-31 for the
// daily Tarot post's `<date>-tarot.*` files.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
// 5.131 — matches the Kate Mobile token the VK_ACCESS_TOKEN was minted with;
// video.save + wall.post are verified working on it.
const API_VERSION = process.env.VK_API_VERSION || '5.131'

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Retries once on VK's "Flood control" (error_code 9) — see broadcast.mjs's
// own vk() helper for the full incident writeup (2026-09-09): several
// daily pipelines' VK posts land within the same few minutes off a shared
// blog-push trigger, and VK starts rejecting after the first one or two.
async function vk(method, params, token, attempt = 0) {
  const res = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    body: new URLSearchParams({ ...params, access_token: token, v: API_VERSION }),
  })
  const json = await res.json()
  if (json.error) {
    if (json.error.error_code === 9 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 15000 + Math.random() * 10000))
      return vk(method, params, token, attempt + 1)
    }
    throw new Error(`VK ${method} failed: ${JSON.stringify(json.error)}`)
  }
  return json.response
}

// VK killed 2026-09-14 — Nick, plainly: "толку ноль - трафика ноль оттуда."
// Same single-choke-point pattern as YOUTUBE_EN_DISABLED/
// INSTAGRAM_EN_DISABLED/THREADS_DISABLED — covers every pipeline that
// calls this script (every daily format + astro-event + monthly-horoscope)
// in one place; the workflow files themselves are untouched. Also fixed in
// broadcast.mjs's own separate/duplicated VK implementation and channel
// lists (promo-post.mjs, write-daily-horoscope.mjs) — see those files.
const VK_DISABLED = true

async function main() {
  if (VK_DISABLED) {
    console.log('VK posting is disabled (Nick, 2026-09-14 — zero traffic from it) — skipping. Remove VK_DISABLED in post-vk.mjs to re-enable.')
    return
  }
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const suffix = args.suffix || 'ru'
  const dateKey = getTodayKey()

  const token = process.env.VK_ACCESS_TOKEN
  const groupId = process.env.VK_GROUP_ID
  if (!token || !groupId) {
    console.error('VK_ACCESS_TOKEN / VK_GROUP_ID not set — see scripts/social/README.md. Skipping.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-vk`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (--force to override)`)
    process.exit(0)
  }

  const videoPath = path.join(dir, `${dateKey}-${suffix}.mp4`)
  const captionPath = path.join(dir, `${dateKey}-${suffix}.caption.txt`)
  const [videoBuf, caption] = await Promise.all([
    readFile(videoPath),
    readFile(captionPath, 'utf8'),
  ])
  const title = caption.split('\n').find((l) => l.trim())?.replace(/^🔮\s*/, '') || 'Карта дня'

  console.log('VK: video.save…')
  const saved = await vk('video.save', {
    name: title.slice(0, 128),
    description: caption,
    group_id: String(groupId),
    wallpost: '0',
  }, token)

  console.log('VK: uploading file…')
  const form = new FormData()
  form.set('video_file', new Blob([videoBuf], { type: 'video/mp4' }), `${dateKey}-${suffix}.mp4`)
  const upRes = await fetch(saved.upload_url, { method: 'POST', body: form })
  const upJson = await upRes.json()
  if (!upJson || (!upJson.video_id && !saved.video_id)) {
    throw new Error(`VK upload failed: ${JSON.stringify(upJson)}`)
  }

  const ownerId = saved.owner_id // negative for a group
  const videoId = saved.video_id || upJson.video_id
  const attachment = `video${ownerId}_${videoId}`

  console.log('VK: wall.post…')
  const post = await vk('wall.post', {
    owner_id: `-${groupId}`,
    from_group: '1',
    message: caption,
    attachments: attachment,
  }, token)

  console.log(`Posted: https://vk.com/wall-${groupId}_${post.post_id}`)
  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
