// Mirrors the EXACT text used for an English Instagram caption into a
// separate Telegram channel, plain text, no video. Nick, 2026-09-05: TikTok
// posts go up with no caption at all (draft-inbox limitation — see
// post-tiktok.mjs), so he wants a fast copy/paste source for that caption
// text. Added the bot (nikolablajen_bot, same one used everywhere else) as
// admin to a new channel, @blajencom, specifically for this.
//
// Deliberately its own tiny module rather than folded into post-telegram.mjs
// or tg-longtext.mjs — this is a one-off convenience channel for Nick's own
// workflow, not part of the Дзен-facing content pipeline those files serve,
// and it only ever fires for EN posts.
//
// Non-fatal by design: a failure here must never break the actual
// Instagram/etc. post it's mirroring — always caught and logged, never
// thrown.
const EN_MIRROR_CHANNEL = process.env.TELEGRAM_EN_MIRROR_CHANNEL || '@blajencom'

export async function mirrorEnCaption(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !text) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: EN_MIRROR_CHANNEL,
        text: String(text).slice(0, 4096),
        disable_web_page_preview: true,
      }),
    })
    const body = await res.json()
    if (!body.ok) console.warn(`mirrorEnCaption to ${EN_MIRROR_CHANNEL} failed:`, JSON.stringify(body))
    else console.log(`mirrored EN caption to ${EN_MIRROR_CHANNEL}`)
  } catch (e) {
    console.warn(`mirrorEnCaption to ${EN_MIRROR_CHANNEL} failed:`, e.message)
  }
}
