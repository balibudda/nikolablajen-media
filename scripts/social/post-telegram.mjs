// Posts today's rendered "card of the day" video to the Telegram channel
// @nikolablajen_news (RU only — see scripts/social/README.md). Needs
// TELEGRAM_BOT_TOKEN (nikolablajen_bot, admin of the channel with "post
// messages"). The channel is public so the @username is the chat_id.
//
// Usage: node scripts/social/post-telegram.mjs [--dir=dist-social] [--suffix=ru]
// --suffix overrides the file-lookup/posted-marker suffix (default: 'ru',
// the only value this script ever used before) — added 2026-08-31 for the
// daily Tarot post's `<date>-tarot.*` files.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wasPosted, markPosted } from './posted-marker.mjs'
import { buildMediaCaption } from './tg-longtext.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const CHANNEL = process.env.TELEGRAM_CHANNEL || '@nikolablajen_news'

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const dir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'dist-social')
  const suffix = args.suffix || 'ru'
  const dateKey = getTodayKey()

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not set — see scripts/social/README.md. Skipping.')
    process.exit(1)
  }

  const tag = `${dateKey}-${suffix}-telegram`
  if (!args.force && (await wasPosted(tag))) {
    console.log(`already posted ${tag} — skipping (--force to override)`)
    process.exit(0)
  }

  const videoPath = path.join(dir, `${dateKey}-${suffix}.mp4`)
  const captionPath = path.join(dir, `${dateKey}-${suffix}.telegram.txt`)
  const [videoBuf, caption] = await Promise.all([
    readFile(videoPath),
    readFile(captionPath, 'utf8'),
  ])

  // ONE message only (Nick, 2026-09-05, live evidence: video+short-lead
  // then the full article as a threaded reply made the Дзен channel
  // crosspost produce two near-identical entries per post — every extra
  // Telegram message becomes its own Дзен "material"). Was: full article
  // as caption if it fit, else short lead + a full-text reply message
  // (up to 3 extra messages for a 12-sign horoscope). Now: always one
  // sendVideo, caption built by buildMediaCaption() — a graceful ≤1024
  // excerpt with the trailing link always kept intact. No inline
  // buttons — they broke the Дзен crosspost (2026-09-03).
  const form = new FormData()
  form.set('chat_id', CHANNEL)
  form.set('caption', buildMediaCaption(caption))
  form.set('parse_mode', 'HTML')
  form.set('supports_streaming', 'true')
  form.set('video', new Blob([videoBuf], { type: 'video/mp4' }), `${dateKey}-${suffix}.mp4`)

  console.log(`Sending video to ${CHANNEL}…`)
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: form })
  const body = await res.json()
  if (!body.ok) throw new Error(`Telegram sendVideo failed: ${JSON.stringify(body)}`)
  const videoMsgId = body.result.message_id
  console.log(`Posted video: message_id ${videoMsgId} → https://t.me/${CHANNEL.replace(/^@/, '')}/${videoMsgId}`)

  await markPosted(tag)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
