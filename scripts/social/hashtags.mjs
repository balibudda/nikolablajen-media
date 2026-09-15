// Rotating hashtag pool for the social pipeline. A few fixed brand tags +
// an optional per-deck tag + a seeded shuffle of a big pool, so no two
// posts carry the same block (better indexing / reach — see
// scripts/social/BACKLOG.md and the "unique text per channel" rule).

function hashStr(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0
  return h
}

export const HASHTAG_CORE = {
  ru: ['#николаблажен'],
  en: ['#nikolablajen'],
}
export const HASHTAG_BY_DECK = {
  ru: {
    golos: ['#голосгоспода'],
    poslaniya: ['#посланиябога'],
    probuzhdenie: ['#пробуждениедуши'],
  },
  en: {
    golos: ['#voiceofgod'],
    poslaniya: ['#messagesofgod'],
    probuzhdenie: ['#awakeningofthesoul'],
  },
}
// 2026-09-01, Nick's explicit ask: no "гадание"/"предсказание"/"магия" (and EN
// equivalents divination/fortunetelling/cartomancy/prediction/magic) anywhere
// in hashtags or SEO keywords — those are only ever used for discoverability,
// never in the app's own reading copy (which already says "зеркало, не
// предсказание", see CONTENT-SAFETY.md), but he'd rather not risk it given the
// pending RF anti-esoteric-advertising bill. Positioning stays "просто
// карты — метафорические карты, таро, оракулы" — cards, not fortune-telling.
export const HASHTAG_POOL = {
  ru: [
    '#картадня', '#карта_дня', '#оракул', '#оракулонлайн', '#таро', '#тародня', '#таролог',
    '#таронлайн', '#раскладтаро', '#архетипы', '#символикакарт', '#внутреннийдиалог',
    '#метафорическиекарты', '#мак', '#маккарты', '#ассоциативныекарты', '#сакральныекарты',
    '#колодакарт', '#рефлексиядня', '#посланиедня', '#посланиевселенной',
    '#энергиядня', '#эзотерика', '#эзотерикаонлайн', '#психологическиекарты', '#мистика', '#духовныйпуть',
    '#духовноеразвитие', '#саморазвитие', '#самопознание', '#психология', '#психологияличности',
    '#осознанность', '#осознанностьжизни', '#медитация', '#медитациядня', '#аффирмации',
    '#аффирмациидня', '#практикадня', '#внутренняясила', '#путьксебе', '#словодня',
    '#мудростьдня', '#светвнутри', '#вера', '#богвовсем', '#ежедневнаяпрактика',
    // Added 2026-09-09 — RU counterpart to the EN TikTok Creator Search
    // Insights pass above. No equivalent in-app tool was available for
    // RU (that's account-specific inside TikTok Studio), so this is a
    // web-search-confirmed pair (#женскаяэнергия, #любовьксебе both
    // verified as actively-used, high-volume tags in this niche) plus a
    // few well-established adjacent self-development terms from general
    // knowledge of the space — lower-confidence than the EN additions,
    // worth Nick's own sanity check against his TikTok Studio RU insights
    // if he screenshots those the same way he did for EN.
    '#женскаяэнергия', '#любовьксебе', '#внутреннийребенок', '#предназначение',
    '#ресурсноесостояние', '#трансформация',
  ],
  en: [
    '#cardoftheday', '#dailycard', '#oracle', '#oracleonline', '#oraclecards', '#oracledeck',
    '#tarot', '#tarotcards', '#tarotonline', '#tarotreading', '#tarotdaily', '#tarotcommunity',
    '#archetypes', '#cardsymbolism', '#innerdialogue', '#metaphoriccards', '#associativecards',
    '#sacredcards', '#dailyreflection', '#messageoftheday', '#dailymessage', '#dailyguidance',
    '#innerwisdom', '#esoteric', '#esoterica', '#mysticism', '#psychologicalcards', '#spiritual',
    '#spirituality', '#spiritualpath', '#spiritualgrowth', '#selfdevelopment', '#selfknowledge',
    '#selfdiscovery', '#psychology', '#mindfulness', '#mindfulliving', '#meditation',
    '#dailymeditation', '#affirmations', '#dailyaffirmations', '#innerstrength', '#pathtoself',
    '#wordoftheday', '#wisdomoftheday', '#lightwithin', '#faith', '#dailypractice',
    // Added 2026-09-09 from TikTok Creator Search Insights (Nick's own
    // screenshots of trending/recommended EN topics) — picked only the
    // ones that fit this app's actual niche (oracle/tarot/spiritual
    // self-development), skipped generic unrelated trends (travel vlogs,
    // MrBeast, product placements etc). "fortune telling cards" was
    // trending too but excluded on purpose — conflicts with the standing
    // no-"fortunetelling" rule right above this file's hashtag pools.
    '#esotericism', '#spiritualmessages', '#spirituallife', '#divinefeminineawakening',
  ],
}

// Tarot-specific semantic core — Nick's ask, 2026-08-31, for the daily Tarot
// card-of-the-day post: real Russian Tarot search terms, concentrated
// (heavier on "таро" itself than the general oracle pool above, which
// dilutes it with МАК/oracle/affirmation terms) to actually pull Tarot
// search traffic through to Дзен. Still 100% generic — no deck name, no
// author, nothing that would lead back to the real source deck, matching
// the standing rule in BACKLOG.md item AC/AL.
export const TAROT_HASHTAG_POOL_RU = [
  '#таро', '#картытаро', '#раскладтаро', '#таролог', '#таронлайн', '#тарокарты',
  '#архетипытаро', '#символикатаро', '#значениекарттаро', '#тарорасклад',
  '#таросегодня', '#таронадень', '#тародня', '#младшийаркан', '#старшийаркан',
  '#арканытаро', '#таропрактика', '#психологиятаро', '#колодатаро',
  '#таробесплатно', '#значениеаркана', '#эзотерика', '#мистика',
]

// English counterpart, added 2026-09-01 alongside the EN Tarot daily post —
// same idea, real English Tarot search terms concentrated on "tarot" itself
// rather than diluted with generic oracle/affirmation terms. Still 100%
// generic — no deck name, no author.
export const TAROT_HASHTAG_POOL_EN = [
  '#tarot', '#tarotcards', '#tarotreading', '#tarotreader', '#tarotonline', '#tarotdeck',
  '#freetarotreading', '#tarotarchetypes', '#tarotmeaning', '#tarotspread',
  '#dailytarot', '#tarottoday', '#tarotoftheday', '#minorarcana', '#majorarcana',
  '#tarotarcana', '#tarotsymbolism', '#tarotpractice', '#tarotdeckonline',
  '#freetarot', '#tarotinterpretation', '#esoteric', '#mysticism',
  // Added 2026-09-09, same TikTok Creator Search Insights source as
  // HASHTAG_POOL.en above — these matched TikTok's own recommended
  // exact-phrase tags for tarot/card-reading content specifically.
  '#tarotcardreading', '#cardreading', '#tarotlovereading', '#tarotmessage',
]

export function pickTarotHashtags(seed, count = 16, locale = 'ru') {
  const loc = locale === 'en' ? 'en' : 'ru'
  const pool = (loc === 'en' ? TAROT_HASHTAG_POOL_EN : TAROT_HASHTAG_POOL_RU).slice()
  let x = hashStr(`${seed}|tarot-hashtags`) || 1
  for (let i = pool.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0
    const j = x % (i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return [...HASHTAG_CORE[loc], ...pool.slice(0, count - 1)].join(' ')
}

// `seed` — anything stable for a given post (e.g. a date, or date+channel so
// each channel gets a different set). `deckKey` optional.
export function pickHashtags(seed, locale = 'ru', deckKey = null, count = 16) {
  const loc = locale === 'en' ? 'en' : 'ru'
  const pool = HASHTAG_POOL[loc].slice()
  let x = hashStr(`${seed}|hashtags`) || 1
  for (let i = pool.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0
    const j = x % (i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = [...HASHTAG_CORE[loc], ...((deckKey && HASHTAG_BY_DECK[loc][deckKey]) || [])]
  for (const tag of pool) {
    if (picked.length >= count) break
    if (!picked.includes(tag)) picked.push(tag)
  }
  return picked.join(' ')
}
