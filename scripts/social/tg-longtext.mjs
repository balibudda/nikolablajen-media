// Send a long HTML article to a Telegram chat as one or more chained
// messages, each within Telegram's 4096-char text limit. Splits on
// paragraph boundaries (blank lines) so it never cuts inside an <b> tag —
// every article in this repo puts each bold header on its own line, so a
// blank-line split is always tag-safe. Used by post-telegram.mjs (the
// daily card/tarot/horoscope video follow-up) and broadcast.mjs
// (the text horoscope + ad-hoc broadcasts).
//
// Nick's standing rule (CLAUDE.md, 2026-08-31, reinforced 2026-09-04 about
// the horoscope specifically): the Telegram post must carry the FULL
// article, never a trimmed выжимка — it feeds Дзен, the top traffic source.

const LIMIT = 4000 // a little under 4096 for safety

export function chunkForTelegram(text, limit = LIMIT) {
  const clean = String(text || '').trim()
  if (clean.length <= limit) return [clean]
  const paras = clean.split(/\n{2,}/)
  const chunks = []
  let buf = ''
  for (const p of paras) {
    const piece = p.trim()
    if (!piece) continue
    if (buf && (buf.length + 2 + piece.length) > limit) {
      chunks.push(buf)
      buf = ''
    }
    if (piece.length > limit) {
      // a single monster paragraph — hard-wrap on sentence boundaries
      if (buf) { chunks.push(buf); buf = '' }
      let rest = piece
      while (rest.length > limit) {
        let cut = rest.lastIndexOf('. ', limit)
        if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit)
        if (cut < 1) cut = limit
        chunks.push(rest.slice(0, cut + 1).trim())
        rest = rest.slice(cut + 1)
      }
      buf = rest.trim()
      continue
    }
    buf = buf ? `${buf}\n\n${piece}` : piece
  }
  if (buf) chunks.push(buf)
  return chunks
}

// Builds ONE media-message caption (Telegram's ≤1024-char cap on
// sendVideo/sendPhoto), preserving the trailing link intact rather than
// truncating it away. Nick, 2026-09-05 (live evidence — two near-identical
// Дзен entries from one promo post): every EXTRA Telegram message a post
// produces (the old pattern was video+short-lead, then the whole article
// as a threaded reply) gets picked up as its own, near-duplicate Дзен
// article via the channel crosspost. So this deliberately does NOT chase
// "the full 2500-4000 char article in Telegram" anymore — one clean
// message, real text, real active link (a media caption never generates a
// secondary link-preview card the way a plain sendMessage does, so this
// also kills the ugly preview box for free). The full article still lives
// on the site's /blog/novosti/<slug>/ page the same pipeline already
// writes; Telegram/Дзен get a substantial, honest excerpt instead of a
// forced trim to a couple of lines.
export function buildMediaCaption(html, limit = 1024) {
  const clean = String(html || '').trim()
  if (clean.length <= limit) return clean
  const lines = clean.split('\n')
  const linkLineIdx = lines.findIndex((l) => l.includes('<a '))
  const linkLine = linkLineIdx !== -1 ? lines[linkLineIdx].trim() : ''
  const bodyLines = linkLineIdx !== -1 ? lines.filter((_, i) => i !== linkLineIdx) : lines
  const body = bodyLines.join('\n').trim()
  const suffix = linkLine ? `\n\n${linkLine}` : ''
  const budget = Math.max(0, limit - suffix.length - 1)
  let cutBody = body
  if (body.length > budget) {
    // Cut at the last complete sentence and stop there — no trailing "…"
    // (Nick, 2026-09-05: a truncated "…." reads as an unfinished thought).
    // Use as much of the budget as fits, but always end on a real period.
    const hard = body.slice(0, budget)
    const cut = Math.max(hard.lastIndexOf('\n\n'), hard.lastIndexOf('. '), hard.lastIndexOf('! '), hard.lastIndexOf('? '))
    cutBody = (cut > 0 ? hard.slice(0, cut + 1) : hard).trimEnd()
  }
  return `${cutBody}${suffix}`.trim()
}

// Sends `text` (HTML) to `chat`. First chunk replies to `replyToId` (if
// given); each subsequent chunk replies to the previous one, so they thread
// under the video/photo. Returns the id of the last message sent.
export async function sendLongText(token, chat, text, replyToId = null) {
  const chunks = chunkForTelegram(text)
  let prevId = replyToId
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: chunks.indexOf(chunk) !== chunks.length - 1,
        ...(prevId ? { reply_to_message_id: prevId } : {}),
      }),
    })
    const body = await res.json()
    if (!body.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(body)}`)
    prevId = body.result.message_id
  }
  return prevId
}
