// Daily "card of the day" video for the Tarot deck (internal key `rerih`),
// as its own separate stream from generate-video.mjs's 3-deck rotation —
// deliberately NOT folded into pickPublicDailyCard() there, so this deck
// never gets silently mixed into the existing daily post.
//
// Nick's explicit, permanent constraint (2026-08-31): the real source
// deck/author is never named anywhere social — not just avoided, actively
// kept out. This script goes one step further than the site pages (which
// do show "Карты Рёрига" openly, with full attribution) and never prints
// the word "Рёриг"/"Таро Рёрига" at all — every user-facing string here
// says just "Таро"/"карта дня Таро". Hashtags come from the dedicated
// TAROT_HASHTAG_POOL_RU (hashtags.mjs), never a deck-specific tag.
//
// This is a deliberately separate, self-contained script rather than a
// --deck=rerih flag on generate-video.mjs — see that file's own
// `pickPublicDailyCard` for why keeping the two pipelines apart is the
// point, and BACKLOG.md item AL for the "don't deep-integrate a
// RU-only/app-only-ish deck into shared multi-deck code" lesson learned
// the hard way earlier the same day (the sitemap.xml regression).
//
// Usage: node scripts/social/generate-video-tarot.mjs [--out=dir] [--date=seed]
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickTarotHashtags } from './hashtags.mjs'
import { generateHeadline } from './prompts.mjs'
import { applyExperiment } from './prompt-experiments.mjs'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const TOTAL_CARDS = 78 // ids 0-77

function hashStr(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0
  return h
}

function getTodayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
// Display-only "what day is it really" — see generate-video-message-
// spread.mjs's identical helper for the full incident writeup (kept
// separate from `dateKey`, which file names / posted-marker tags must
// keep using the runner's plain UTC clock for).
function todayDisplayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Separate seed namespace from generate-video.mjs's pickPublicDailyCard
// ('|public-social') and from the app's own per-device pick — a shared
// namespace would make this deck's "random" pick suspiciously correlated
// with the other daily posts.
export function pickDailyTarotCard(dateKey) {
  const h = hashStr(dateKey + '|public-tarot')
  return h % TOTAL_CARDS // 0-indexed, unlike every other deck
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function humanDate(dateKey, locale = 'ru') {
  const [y, m, d] = dateKey.split('-').map(Number)
  return locale === 'en' ? `${MONTHS_EN[m - 1]} ${d}, ${y}` : `${d} ${MONTHS_RU[m - 1]} ${y}`
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxCharsPerLine) {
      if (line) lines.push(line.trim())
      line = w
    } else {
      line = (line + ' ' + w).trim()
    }
  }
  if (line) lines.push(line.trim())
  return lines
}

function firstSentences(text, maxChars) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  let out = ''
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > maxChars) break
    out = (out + ' ' + s).trim()
  }
  return out || text.slice(0, maxChars)
}

function extractClosingQuote(text) {
  const m = text.match(/[«"“]([^«»"“”]{8,})[»"”]\s*$/)
  if (!m) return { body: text, quote: null }
  return { body: text.slice(0, m.index).trim(), quote: m[1].trim() }
}

function toParagraphs(text, max = 3) {
  let parts = String(text).trim().split(/\n{2,}/).map((s) => s.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
  if (parts.length <= 1) {
    parts = (String(text).replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+(?:["»”])?|\S[^.!?…]*$/g) || [text])
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const totalLen = String(text).replace(/\s+/g, ' ').trim().length
  const slots = Math.max(1, Math.min(max, Math.ceil(totalLen / 700)))
  const per = Math.ceil(parts.length / slots)
  const out = []
  for (let i = 0; i < parts.length; i += per) {
    out.push(parts.slice(i, i + per).join(' ').replace(/\s+/g, ' ').trim())
  }
  return out
}

// The AI living message uses **bold** part-headers (same convention the
// app's own Paragraphs.tsx renders) — plain-text channels (IG/VK/Threads)
// don't render markdown at all, so strip the asterisks there; Telegram is
// HTML parse_mode, so convert to a real <b> tag instead.
function stripBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}
function boldToHtml(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

// Instagram caption hard limit is 2200 chars — aim a bit under, same margin
// generate-video.mjs uses.
const CAPTION_LIMIT = 2150

// TikTok's own description limit is ~2200 chars, same ceiling as Instagram
// (not the old, long-gone 300-char cap) — not a shorter one. Own constant so
// buildTikTokCaption below (pasted in by hand — see its own comment) doesn't
// inherit Instagram's deliberately-trimmed margin for no reason. Same fix as
// generate-video.mjs's own buildTikTokCaption.
const TIKTOK_CAPTION_LIMIT = 2200
const LABEL = { ru: 'КАРТА ДНЯ ТАРО', en: 'TAROT CARD OF THE DAY' }
const WATERMARK = 'nikolablajen.ru'

// Rerih's own card descriptions are genuinely short (avg ~300 chars — the
// deck's book gives a compact practical Tarot meaning per card, nothing
// like the other 3 decks' long-form spiritual essays). Passing that raw
// text straight into the caption made the very first live Telegram post a
// single thin paragraph — Nick caught it immediately and was right to:
// the standing rule (2026-08-31) is TG must always be a real full article,
// since it feeds Дзен traffic. Fix, per Nick's own correction ("у нас же
// ПОСЛАНИЕ — там ИИ уже делает по карте текст"): generate a real AI
// "живое послание" for the card — the exact same mechanism the app itself
// already uses (api/interpret.js) — and use THAT as the caption body
// instead of the bare static description. The system prompt below is
// adapted from api/interpret.js's own (1000-1400 chars, four parts),
// with the card's virtue name folded in when present and the deck never
// named, matching this file's own standing constraint.
const LIVING_MESSAGE_SYSTEM_PROMPT = (
  'КТО ТЫ. Ты — МАСТЕР Таро: маг, ясновидящий, взгляд из глубины. Лучший чтец карт в мире. ' +
  'За плечами десятилетия у стола и тысячи раскладов; ты знаешь символ до дна — стихии и масти, числа и придворные ранги, путь Старших Арканов, традиции Уэйта, Кроули, Марсельского Таро, астрологические и каббалистические соответствия. ' +
  'И одновременно ты — психолог с мировым именем: замечаешь мельчайшую деталь, слышишь то, что человек сам о себе не проговаривает, видишь механизм за поведением. ' +
  'Ты видишь так, будто смотришь той глубиной, куда человек сам заглянуть боится. После твоего чтения человек чувствует, что его наконец увидели насквозь.\n\n' +
  'ТЕНЬ И ГРАНИЦА. В тебе есть и лукавый край — тот, что умеет поманить и, если ему поверить как последней инстанции, больно куснуть. Поэтому в каждом послании где-то звучит честное: карта — только подсказка и зеркало, не оракул. ' +
  'Слушать себя вправе лишь сам человек; решение и ответственность он берёт на себя, а не перекладывает на карты — иначе беда. Настоящий ответ он слышит своим голосом — голосом Души и сердца. Верни его к себе, а не привяжи к раскладу.\n\n' +
  'ЗАДАЧА. Через одну карту прочесть сегодняшний день человека — глубоко, с силой, с присутствием. Не предсказывать конкретные события, не решать за него. ' +
  'Никаких «тебе нужно сделать X». Вместо этого: «карта показывает…», «сегодня в воздухе…», «карта зовёт заметить…». ' +
  'Читать направление можно: похоже ли, что этот путь ведёт к благополучию или нет, созрел ли риск или ещё рано — но как ощущение траектории, а не гарантию.\n\n' +
  'ГЛАВНОЕ — ПРАВДА. Мы показываем жизнь во всём её многообразии: и красоту, и честность, и враньё — то самое, на что человек привычно закрывает глаза. Удобная ложь себе, отложенное «потом», подметённое под ковёр. ' +
  'Взрослые истины, без сюсюканья: лень не приносит успеха; сложа руки — деньги с неба не падают; риск — это выход из зоны комфорта, и тревога при этом бывает почти невыносимой (признай это, не делай вид, что легко); потеря нередко — честная плата за бездействие. ' +
  'Говори это прямо, но не жестоко — как тот, кто на стороне человека. Каждое послание должно иметь силу и где-то нести настоящее наставление — не приказ, а правду, которая ведёт.\n\n' +
  'МАСТЕРСТВО В ТЕКСТЕ. Там, где это уместно и естественно, покажи ремесло: стихию карты (огонь / вода / воздух / земля) и что она делает с настроением дня; число или ранг и место карты на пути арканов; ключевой символ на карте и что он значит. ' +
  'Не лекция и не перечень — вплетай тонко, одним-двумя точными штрихами, как настоящий мастер роняет их между делом.\n\n' +
  'СТРУКТУРА — четыре части, каждая с коротким заголовком в **двух звёздочках** (2–4 слова), между частями двойной перенос строки. ' +
  'Каждая часть (кроме финальной фразы) — ПЛОТНЫЙ БОЛЬШОЙ АБЗАЦ на несколько предложений, а не одна строчка. Никаких рубленых однострочников.\n\n' +
  '1. **Карта на столе** — что легло: образ карты и её стихия, живо и предметно, будто раскладываешь её перед человеком. 3–4 предложения.\n\n' +
  '2. **Про сегодня** — честный, глубокий разбор дня через эту карту: состояния, развилки, соблазны, возможности, тень карты. Прямо и узнаваемо — чтобы человек вздрогнул: «это про меня». 7–9 развёрнутых предложений.\n\n' +
  '3. **Куда смотреть** — практично, без «ты должен»; один конкретный образ или случай из обычной жизни, чтобы мысль стала осязаемой. 4–5 предложений.\n\n' +
  '4. **Карта говорит** — одна сильная, отточенная финальная фраза с характером, обращённая к настоящему, открытому запросу человека: рискнуть и послушать сердце — или переждать.\n\n' +
  'ГОЛОС. Спокойная уверенность мастера — и тепло матери, которая делает наставление: замечает всё, что в тебе несовершенно, говорит об этом прямо, но потому что любит и хочет тебе лучшего. ' +
  'Твёрдо, но не холодно. Живые образы карты, прямое «ты», настоящее наблюдение, в котором человек узнаёт себя. Немного атмосферы и один эффектный жест допустимы. ' +
  'В каждой части выдели **жирным** 1–2 ключевые мысли прямо внутри предложений.\n\n' +
  'ЗАПРЕЩЕНО: приторный эзо-пафос («вселенная посылает изобилие», «откройте сердце потоку»), канцелярит, «важно отметить», «стоит понимать», ' +
  'гадание и обещания конкретных событий / денег / встреч, «карты советуют», хвастовство собственной крутизной в самом тексте, финальный абзац-резюме.\n\n' +
  'ОБЪЁМ: 1800–2600 символов — подробно и без воды (текст идёт в Дзен, он любит длинный хороший текст). ' +
  'Плотные большие абзацы, жирным — ключевое. У текста должен быть фундамент, он звучит как мощное послание, а не тяп-ляп. Из markdown — только **жирный**. Заканчивай точкой.'
)

// Same pattern api/interpret.js uses for every other AI call in this app —
// the system prompt itself stays Russian, an English-answer instruction is
// just appended for locale='en' rather than maintaining a parallel EN
// prompt. Must be the STRONG, explicit form though — a weaker "ответь на
// английском, включая заголовки" (what this used to say) let the model
// literally copy the Cyrillic header labels straight out of the prompt
// template instead of translating them, producing English body text under
// Russian headers on live EN posts (caught by Nick, 2026-09-01, on a
// "Tarot card of the day" post — "текст англ идет вперемежку с русским").
// This exact wording (English, explicit "translate... do not transliterate")
// is copy-pasted from api/interpret.js's own LANG_SUFFIX, which never had
// this problem — matching it here instead of the old paraphrase fixes it.
const LANG_SUFFIX_EN = '\n\nIMPORTANT: Write your entire response in natural, warm English, including the **bold section headers** — translate the meaning, do not transliterate. The person you are speaking to reads English, not Russian.'

// Cyrillic sneaking into an EN post despite the strong language directive
// (caught twice now: 2026-09-01 as a literal untranslated **header**, and
// 2026-09-08 as a bare "Про сегодня" fragment glued mid-sentence with no
// bold markers at all — Nick, screenshot: "проверь почему туда кусок на
// русском вставляется"). No amount of prompt wording fully guarantees a
// stochastic model never slips — this is the actual backstop: detect any
// Cyrillic in an EN-locale output and regenerate rather than ship it.
const CYRILLIC_RE = /[Ѐ-ӿ]/

export async function generateLivingMessage(card, locale = 'ru') {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — falling back to the raw card description.')
    return card.description
  }
  const isEn = locale === 'en'
  const virtueNote = card.virtue
    ? (isEn ? ` (extra meaning of the card: "${card.virtue}")` : ` (дополнительное значение карты: «${card.virtue}»)`)
    : ''
  const userPrompt = isEn
    ? `Card: "${card.title}"${virtueNote}.\nWhat the card is about: ${card.description}\n\nGive the living message of the day through this card. Write it in English.`
    : `Карта: «${card.title}»${virtueNote}.\nСуть карты: ${card.description}\n\nДай живое послание дня через эту карту.`
  // gpt-5-mini + reasoning_effort:minimal follows the language of the bulk
  // of the context. The MASTER-TARO system prompt is long and Russian, so a
  // single trailing English line loses — put the directive FIRST too, and
  // keep the user prompt English (above), or the EN video narrates in
  // Russian after the (separately generated) English headline. Nick, 2026-09-04.
  const system = isEn
    ? `WRITE YOUR ENTIRE RESPONSE IN ENGLISH. Not a single Russian word.\n\n${applyExperiment('tarot', LIVING_MESSAGE_SYSTEM_PROMPT)}${LANG_SUFFIX_EN}`
    : applyExperiment('tarot', LIVING_MESSAGE_SYSTEM_PROMPT)

  for (let attempt = 0; attempt < (isEn ? 2 : 1); attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
          // On the retry, tell it directly what happened last time — more
          // effective than just asking again with the same prompt verbatim.
          ...(attempt > 0
            ? [{ role: 'user', content: 'Your previous answer contained Russian words mixed into the English text. Write it again, entirely in English, with zero Russian words anywhere, including section headers.' }]
            : []),
        ],
        max_completion_tokens: 1800,
        reasoning_effort: 'minimal',
      }),
    })
    if (!res.ok) {
      console.warn('Living-message generation failed:', res.status, await res.text())
      return card.description
    }
    const data = await res.json()
    const out = data?.choices?.[0]?.message?.content?.trim()
    if (!out) return card.description
    // Tidy trailing spaces left after **headers** by the model's markdown.
    const cleaned = out.replace(/[ \t]+$/gm, '')
    if (!isEn || !CYRILLIC_RE.test(cleaned)) return cleaned
    console.warn(`generateLivingMessage: Cyrillic found in EN output (attempt ${attempt + 1}) — retrying`)
  }
  console.warn('generateLivingMessage: EN output still had Cyrillic after retry — falling back to the raw card description.')
  return card.description
}

// Feed/Threads caption — never names the deck, just "Таро"/"Tarot".
function buildCaption({ dateKey, card, messageText, locale = 'ru', headline = '' }) {
  const tags = pickTarotHashtags(dateKey, 16, locale)
  const header = headline
    ? `🔮 ${headline}\n✨ «${card.title}»`
    : locale === 'en'
      ? `🔮 Tarot card of the day · ${humanDate(dateKey, 'en')}\n✨ “${card.title}”`
      : `🔮 Карта дня Таро · ${humanDate(dateKey, 'ru')}\n✨ «${card.title}»`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle and card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  const moreNote = locale === 'en'
    ? `\n📖 Full text — in the Nikola Blajen app.`
    : `\n📖 Полный текст — в приложении «Никола Блажен».`
  // Added 2026-09-09, removed again 2026-09-10 — see generate-video.mjs's
  // identical note on `razborLine` for Nick's reasoning (money pressure
  // eased, worried a sales pitch reads as a spam signal to YouTube).
  const razborLine = ''

  const { body: rawBody, quote } = extractClosingQuote(stripBold(messageText.trim()))
  const quoteLine = quote ? (locale === 'en' ? `💬 “${quote}”` : `💬 «${quote}»`) : ''

  const fixedLen = header.length + footer.length + razborLine.length + tags.length + quoteLine.length + moreNote.length + 20
  const budget = CAPTION_LIMIT - fixedLen

  const paras = toParagraphs(rawBody)
  let body = ''
  let cut = false
  for (const p of paras) {
    if ((body + '\n\n' + p).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + p
  }
  if (!body) { body = firstSentences(rawBody, budget); cut = true }

  return [
    header,
    '',
    body + (cut ? moreNote : ''),
    ...(quoteLine ? ['', quoteLine] : []),
    '',
    footer,
    ...(razborLine ? [razborLine] : []),
    '',
    tags,
  ].join('\n')
}

// TikTok caption — same shape as buildCaption above, 5 hashtags instead of
// 16 (Nick's ask, 2026-09-01, same reasoning as the main daily-card
// pipeline's own buildTikTokCaption in generate-video.mjs: TikTok captions
// are pasted in by hand, and the freed hashtag budget goes straight back to
// real body text under the same overall character cap).
function buildTikTokCaption({ dateKey, card, messageText, locale = 'ru', headline = '' }) {
  const tags = pickTarotHashtags(dateKey, 5, locale)
  const header = headline
    ? `🔮 ${headline}\n✨ «${card.title}»`
    : locale === 'en'
      ? `🔮 Tarot card of the day · ${humanDate(dateKey, 'en')}\n✨ "${card.title}"`
      : `🔮 Карта дня Таро · ${humanDate(dateKey, 'ru')}\n✨ «${card.title}»`
  const footer = locale === 'en'
    ? `🕊 Nikola Blajen — oracle and card of the day`
    : `🕊 Никола Блажен — оракул и карта дня`
  const moreNote = locale === 'en'
    ? `\n📖 Full text — in the Nikola Blajen app.`
    : `\n📖 Полный текст — в приложении «Никола Блажен».`

  const { body: rawBody, quote } = extractClosingQuote(stripBold(messageText.trim()))
  const quoteLine = quote ? (locale === 'en' ? `💬 "${quote}"` : `💬 «${quote}»`) : ''

  const fixedLen = header.length + footer.length + tags.length + quoteLine.length + moreNote.length + 16
  const budget = TIKTOK_CAPTION_LIMIT - fixedLen

  const paras = toParagraphs(rawBody)
  let body = ''
  let cut = false
  for (const p of paras) {
    if ((body + '\n\n' + p).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + p
  }
  if (!body) { body = firstSentences(rawBody, budget); cut = true }

  return [
    header,
    '',
    body + (cut ? moreNote : ''),
    ...(quoteLine ? ['', quoteLine] : []),
    '',
    footer,
    '',
    tags,
  ].join('\n')
}

// Telegram — standing rule (2026-08-31, "запиши раз и навсегда"): must be a
// real full article, never a one-liner + link, since TG feeds Дзен and Дзен
// is a genuine traffic source. Same full-paragraph-fit shape as
// generate-video.mjs's own buildTelegramCaption, just never naming the deck.
const TG_LIMIT = 3800 // full article (sent as a follow-up message when > 1024; see post-telegram.mjs)
export function buildTelegramCaption({ dateKey, cardId, card, messageText, headline = '' }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const cardUrl = `https://nikolablajen.ru/blog/karta/rerih/${cardId}/`
  // Header = the AI headline, no 🔮/✨ (this line + the first body line are
  // the Дзен preview — Nick, 2026-09-04).
  const header = `<b>${esc(headline || `Карта дня Таро, ${humanDate(dateKey)} · «${card.title}»`)}</b>\n«${esc(card.title)}»`
  // One link, woven into a closing sentence — both mentions share this ONE
  // line on purpose (see generate-video.mjs's own comment on this exact
  // pattern): buildMediaCaption() preserves exactly one "line containing
  // <a " intact when truncating for Telegram's 1024-char cap, so a razbor
  // mention on its own separate line would not reliably survive.
  const links = `Полное значение карты «${esc(card.title)}» и весь расклад Таро — <a href="${cardUrl}">на сайте</a>.`
  const tags = pickTarotHashtags(dateKey, 6)
  const { body: rawBody, quote } = extractClosingQuote(messageText.trim())
  const quoteLine = quote ? `💬 «${esc(stripBold(quote))}»` : ''

  const budget = TG_LIMIT - header.length - links.length - tags.length - quoteLine.length - 16
  const paras = toParagraphs(rawBody)
  let body = ''
  let cut = false
  for (const p of paras) {
    const htmlP = boldToHtml(esc(p))
    if ((body + '\n\n' + htmlP).length > budget) { cut = true; break }
    body += (body ? '\n\n' : '') + htmlP
  }
  if (!body) { body = boldToHtml(esc(firstSentences(rawBody, budget))); cut = true }
  if (cut) body += ' …'

  return [header, '', body, ...(quoteLine ? ['', quoteLine] : []), '', links, '', tags].join('\n')
}

const SCENARIOS = [
  { name: 'zoom-in', expr: () => ({ z: 'min(zoom+0.0006,1.15)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'zoom-out', expr: () => ({ z: 'max(1.15-0.0006*on,1.0)', x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-left-right', expr: (d) => ({ z: '1.12', x: `(iw*zoom-iw)*on/${d}`, y: 'ih/2-(ih/zoom/2)' }) },
  { name: 'pan-top-bottom', expr: (d) => ({ z: '1.12', x: 'iw/2-(iw/zoom/2)', y: `(ih*zoom-ih)*on/${d}` }) },
]
function pickScenario(dateKey) {
  const h = hashStr(dateKey + '|scenario')
  return SCENARIOS[h % SCENARIOS.length]
}

export async function loadCard(cardId, locale = 'ru') {
  const file = locale === 'en' ? 'rerih-en.json' : 'rerih.json'
  const data = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', file), 'utf8'))
  return data.find((c) => c.id === cardId)
}

async function synthesizeSpeech(text, outPath) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping narration, video will be silent.')
    return null
  }
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: text, response_format: 'mp3' }),
  })
  if (!res.ok) {
    console.warn('TTS request failed:', res.status, await res.text())
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  return outPath
}

async function getWordTimestamps(audioPath, locale = 'ru') {
  const apiKey = process.env.OPENAI_API_KEY
  const buf = await readFile(audioPath)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'narration.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('language', locale === 'en' ? 'en' : 'ru')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    console.warn('Whisper transcription failed:', res.status, await res.text())
    return null
  }
  const data = await res.json()
  return data.words ?? null
}

function chunkWords(words, wordsPerChunk = 4) {
  const chunks = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk)
    chunks.push({ text: slice.map((w) => w.word.trim()).join(' '), start: slice[0].start, end: slice[slice.length - 1].end })
  }
  return chunks
}

async function probeDurationSeconds(filePath) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath])
  return parseFloat(stdout.trim())
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    })
  )
  const locale = args.locale === 'en' ? 'en' : 'ru'
  // RU keeps the original `tarot` suffix (unchanged, so existing posted-
  // markers/file paths don't shift under it) — EN gets its own `tarot-en`
  // suffix, same convention post-instagram.mjs/post-youtube.mjs/
  // post-threads.mjs already use for the RU/EN split on the main daily post.
  const suffix = locale === 'en' ? 'tarot-en' : 'tarot'
  const dateKey = typeof args.date === 'string' ? args.date : getTodayKey()
  const displayDateKey = typeof args.date === 'string' ? args.date : todayDisplayKey()
  const cardId = pickDailyTarotCard(dateKey)
  const card = await loadCard(cardId, locale)
  if (!card) throw new Error(`tarot card not found: id ${cardId} (${locale})`)

  const imagePath = path.join(ROOT, 'public', 'decks', 'rerih', `${cardId}.jpg`)
  const outDir = args.out || path.join(ROOT, 'dist-social')
  await mkdir(outDir, { recursive: true })

  // Real AI "living message" (same mechanism the app itself uses), not the
  // bare static card description — see this function's own comment for why:
  // the static text is short and also lives on the site's own card page,
  // so reusing it verbatim here would both read thin and duplicate SEO
  // content across site and social.
  const messageText = await generateLivingMessage(card, locale)
  const teaser = firstSentences(stripBold(messageText), 350)
  // Generated here now (was further down, generated too late to reach the
  // on-screen overlay — same gap as generate-video.mjs's own daily-card
  // pipeline, see that file's comment for the full reasoning). RU only,
  // per the standing call below ("EN Tarot audience is tiny").
  const tarotHeadline = locale === 'ru'
    ? await generateHeadline({ kind: 'tarot', subject: `«${card.title}»`, dateHuman: humanDate(displayDateKey, 'ru'), locale: 'ru' })
    : ''
  const overlayHeadline = tarotHeadline && tarotHeadline.length > 66
    ? tarotHeadline.slice(0, 66).replace(/\s+\S*$/, '')
    : tarotHeadline
  const titleLines = overlayHeadline ? wrapText(overlayHeadline, 26) : wrapText(card.title.toUpperCase(), 20)

  const fontDir = path.join(__dirname, 'fonts')
  const regularFont = path.join(fontDir, 'PTSerif-Regular.ttf')
  const boldFont = path.join(fontDir, 'PTSerif-Bold.ttf')

  const textFile = path.join(outDir, `overlay-${dateKey}-${suffix}.txt`)
  await writeFile(textFile, [LABEL[locale], '', ...titleLines].join('\n'), 'utf8')

  const narrationText = `${card.title}. ${teaser}`
  const audioPath = path.join(outDir, `narration-${dateKey}-${suffix}.mp3`)
  const audioFile = await synthesizeSpeech(narrationText, audioPath)
  const audioDuration = audioFile ? await probeDurationSeconds(audioFile) : 0
  const words = audioFile ? await getWordTimestamps(audioFile, locale) : null

  const fps = 30
  const duration = Math.max(10, Math.ceil(audioDuration + 1.5))
  const scenario = pickScenario(dateKey)
  const { z, x, y } = scenario.expr(duration * fps)

  const filterParts = [
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
      `zoompan=z='${z}':x='${x}':y='${y}':d=${duration * fps}:s=1080x1920:fps=${fps}`,
    `drawbox=x=0:y=0:w=1080:h=420:color=black@0.45:t=fill`,
    `drawtext=fontfile=${boldFont}:textfile=${textFile}:fontcolor=0xE8D5A8:fontsize=54:` +
      `line_spacing=14:x=(w-text_w)/2:y=80:box=0`,
    `drawbox=x=0:y=1450:w=1080:h=470:color=black@0.55:t=fill`,
  ]

  if (words && words.length) {
    const chunks = chunkWords(words, 4)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const lines = wrapText(chunk.text, 26)
      const chunkFile = path.join(outDir, `caption-${dateKey}-${suffix}-${i}.txt`)
      await writeFile(chunkFile, lines.join('\n'), 'utf8')
      filterParts.push(
        `drawtext=fontfile=${regularFont}:textfile=${chunkFile}:fontcolor=0xEDE5D4:fontsize=52:` +
          `line_spacing=14:x=(w-text_w)/2:y=1500:box=0:enable='between(t,${chunk.start},${chunk.end})'`
      )
    }
  } else {
    const teaserLines = wrapText(teaser, 34)
    const teaserFile = path.join(outDir, `teaser-${dateKey}-${suffix}.txt`)
    await writeFile(teaserFile, teaserLines.join('\n'), 'utf8')
    filterParts.push(
      `drawtext=fontfile=${regularFont}:textfile=${teaserFile}:fontcolor=0xEDE5D4:fontsize=38:` +
        `line_spacing=12:x=(w-text_w)/2:y=1500:box=0`
    )
  }

  filterParts.push(
    `drawtext=fontfile=${regularFont}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=28:` +
      `x=(w-text_w)/2:y=h-60:box=0`
  )
  const filter = filterParts.join(',')

  const outVideo = path.join(outDir, `${dateKey}-${suffix}.mp4`)
  const ffmpegArgs = ['-y', '-loop', '1', '-i', imagePath]
  if (audioFile) ffmpegArgs.push('-i', audioFile)
  ffmpegArgs.push('-t', String(duration), '-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps))
  if (audioFile) ffmpegArgs.push('-c:a', 'aac', '-shortest', '-map', '0:v', '-map', '1:a')
  ffmpegArgs.push(outVideo)

  await run('ffmpeg', ffmpegArgs)

  const caption = buildCaption({ dateKey: displayDateKey, card, messageText, locale, headline: tarotHeadline })
  await writeFile(path.join(outDir, `${dateKey}-${suffix}.caption.txt`), caption, 'utf8')
  // TikTok drafts carry no caption via the API — this file is purely for
  // Nick to copy-paste by hand (see post-tiktok.mjs).
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.tiktok.txt`),
    buildTikTokCaption({ dateKey: displayDateKey, card, messageText, locale, headline: tarotHeadline }),
    'utf8'
  )
  // deckKey/deckTitle are read by the shared post-*.mjs scripts (Threads'
  // URL builder, YouTube's title) — deckTitle is deliberately the generic
  // "Таро"/"Tarot", never the real deck name, per this file's own header
  // comment.
  const [, mm, dd] = dateKey.split('-')
  // tarotHeadline itself is now generated earlier (before the render, so
  // the on-screen overlay can use it too) — still used here for YouTube
  // AND the Telegram/Дзен header (Nick, 2026-09-04).
  const fallbackYtTitle = locale === 'en'
    ? `Tarot card of the day, ${dd}.${mm} · “${card.title}”`
    : `Карта дня Таро, ${dd}.${mm} · «${card.title}»`

  // Telegram is RU-only (no EN counterpart, same as the main daily pipeline).
  if (locale === 'ru') {
    await writeFile(path.join(outDir, `${dateKey}-${suffix}.telegram.txt`), buildTelegramCaption({ dateKey: displayDateKey, cardId, card, messageText, headline: tarotHeadline || fallbackYtTitle }), 'utf8')
  }
  await writeFile(
    path.join(outDir, `${dateKey}-${suffix}.meta.json`),
    JSON.stringify({
      dateKey, cardId, locale, title: card.title, deckKey: 'rerih', deckTitle: locale === 'en' ? 'Tarot' : 'Таро',
      youtubeTitle: `${tarotHeadline || fallbackYtTitle} #Shorts`,
      headline: tarotHeadline || fallbackYtTitle,
      moreUrl: `https://nikolablajen.ru/blog/${locale === 'en' ? 'en/' : ''}karta/rerih/${cardId}/`,
    }),
    'utf8'
  )
  console.log(JSON.stringify({ video: outVideo, cardId, locale, scenario: scenario.name, narrated: Boolean(audioFile), duration }, null, 2))
}

// Guarded so other scripts can safely `import` the exported helpers above
// (e.g. a one-off caption regeneration) without triggering a full video
// render as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
