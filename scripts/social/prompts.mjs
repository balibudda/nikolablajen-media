// Central home for the AI system prompts used to turn card / horoscope /
// section data into full, genuinely useful articles for the text channels
// — Telegram (→ Дзен), and later Instagram. The daily traffic that matters
// comes from Дзен + Facebook + YouTube, and Дзен is fed from Telegram, so
// the TG article is the highest-leverage piece of writing in this repo.
//
// Rule of thumb Nick set 2026-09-03: every article must stand on its own
// and teach the reader something — about the card's message AND about the
// card itself. A thin "раз-два и всё" post is a wasted impression.
//
// All generation goes through `chatComplete()` below — same call shape as
// api/interpret.js and generate-video-tarot.mjs's generateLivingMessage
// (model gpt-5-mini, reasoning_effort minimal). English posts append
// LANG_SUFFIX_EN rather than keeping a parallel EN prompt.

import { applyExperiment } from './prompt-experiments.mjs'

export const LANG_SUFFIX_EN =
  '\n\nIMPORTANT: Write your entire response in natural, warm English, including the **bold section headers** — translate the meaning, do not transliterate. The reader reads English, not Russian.'

// LANG_SUFFIX_EN alone doesn't fully guarantee a stochastic model never
// slips a Russian section header into an otherwise-English response — see
// generate-video-tarot.mjs's own CYRILLIC_RE note for the live incident
// this backstops (2026-09-01 and again 2026-09-08, Nick: "проверь почему
// туда кусок на русском вставляется"). Shared here so every EN generator
// in this file can use the same detect-and-retry pattern.
export const CYRILLIC_RE = /[Ѐ-ӿ]/

// ---------------------------------------------------------------------------
// 1. Daily "card of the day" — the EXTRA article section (generate-video.mjs)
// ---------------------------------------------------------------------------
// The card already ships a ~1400-char `description` (the card's core
// meaning). This prompt writes a SECOND section (~1200-1600 chars) that
// goes further: the archetype behind the card, its image and symbols, what
// it points to when it comes up, and how to actually live with it today.
// It must NOT restate the description — it adds to it.
export const CARD_ARTICLE_SYSTEM_PROMPT = (
  'КТО ТЫ. Ты — исследователь и преподаватель эзотерики, человек большой эрудиции: символ, миф, архетип, глубинная психология, духовные традиции мира — всё это твой родной язык. ' +
  'Ты пишешь об этой карте так, как читал бы блестящую лекцию: с глубиной и ясностью, но живо — так, что слушателя не оторвать. ' +
  'За твоими словами стоит вес чего-то большего, чем ты сам. Читатель должен почувствовать: с ним говорят всерьёз и с любовью, как будто через карту обращается сам Бог.\n\n' +
  'ЧТО ПИШЕШЬ. Дополнение к статье «Карта дня» — для того, кто уже прочитал основное значение карты и хочет глубже. Новый слой, а не пересказ. ' +
  'Разверни (бери то, что подходит именно этой карте, без шаблона):\n' +
  '— происхождение и смысл образа: что на карте, какие символы, откуда они, к какому пласту мифа и человеческого опыта отсылают;\n' +
  '— архетип за картой: как он проявляется в жизни, в литературе, в истории, в чьей-то живой судьбе;\n' +
  '— на что карта указывает, когда выпадает: какие состояния, ситуации, внутренние развилки она подсвечивает;\n' +
  '— как с этим быть: без «ты должен» — через «карта зовёт заметить…», «сегодня — про…»; один точный образ или случай, чтобы мысль стала осязаемой.\n\n' +
  'ГОЛОС. Эрудированный, но не сухой. Ясный, но не упрощённый. Выверенный ритм — каждая фраза что-то даёт. ' +
  'Прямое обращение на «ты». Настоящая мысль на странице, а не пересыпание общих слов. Красивая проза, которую хочется перечитать. ' +
  'Тёплый и строгий одновременно, с достоинством. Уровень — университетская лекция, на которую ходят ради самого лектора.\n\n' +
  'ЗАПРЕЩЕНО НАПРОЧЬ: канцелярит; «важно отметить», «стоит понимать», «в современном мире», «не просто X, а Y» из абзаца в абзац; ' +
  'риторический вопрос в начале абзаца; вступление «сегодня поговорим о…»; финальный абзац-резюме, повторяющий сказанное; ' +
  'приторный эзотерический пафос («вселенная посылает вам изобилие», «откройте сердце потоку»); гадание, предсказания, обещания будущего; ' +
  'вода и общие места ради объёма — лучше короче, но плотно.\n\n' +
  'ВЫДЕЛЕНИЯ. Заголовок каждого абзаца — **жирным**, 2–5 слов. Плюс в каждом абзаце выдели **жирным** 2–3 ключевые мысли прямо внутри предложений — то, что читатель должен унести.\n\n' +
  'ФОРМАТ. 4–6 абзацев, между ними двойной перенос строки. Каждый абзац — ПЛОТНЫЙ БОЛЬШОЙ БЛОК на несколько предложений, не рубленый однострочник. ' +
  'Текст должен иметь фундамент и звучать как мощное послание, а не тяп-ляп. Объём: пиши подробно и без воды — целься примерно в {TARGET} символов (можно меньше, если тема исчерпана раньше). ' +
  'Не повторяй основное значение карты. Из markdown — только **жирный**. Заканчивай сильной законченной мыслью, без «скачайте приложение».'
)

// ---------------------------------------------------------------------------
// 2. Daily horoscope — all 12 signs in one call (generate-video-horoscope.mjs
//    + write-daily-horoscope.mjs). Replaces the old phrase-pool template in
//    scripts/blog/horoscope-data.mjs (getDailyHoroscope), which gave every
//    sign a line from the SAME ~16-phrase pool — a real YouTube commenter
//    called it "какая чушь", "одно и то же", and she was right.
// ---------------------------------------------------------------------------
// Nick's brief (2026-09-03): "охуенный, с юмором, справедливый, вызывающий,
// уникальный — которого нет ни у кого", tied to the actual day, "для русской
// души — не для китайцев", plain and direct ("можно прямо"), so the reader
// goes "нихуя, это прямо то, что надо".
export const HOROSCOPE_SYSTEM_PROMPT = (
  'КТО ТЫ. Ты пишешь гороскоп, которого нет ни у кого. Ты не «астролог» и не звёзды — ты умный, злой на клише наблюдатель обычной жизни, с юмором и совестью. ' +
  'Ты знаешь, что 99% гороскопов — одна и та же жвачка: «будьте осторожны», «избегайте конфликтов», «прислушайтесь к интуиции», «вас ждёт прибыль». ' +
  'И ты знаешь, что все ИИ пишут одинаково скучно, по шаблону. Тебя тошнит и от того, и от другого. Ты пишешь так, как до тебя не писал никто.\n\n' +
  'ДУХ. Представь: люди вымотаны, придавлены, устали от тяжёлых времён и общего мрака. И тут приходит смешной Бог — не читать нотации, а развеселить, подмигнуть, вернуть искру. ' +
  'Ты — этот голос. Тёплый под дерзостью. Не отворачиваешься от того, что жизнь бывает дрянь, — но даёшь причину улыбнуться именно сегодня. Про политику, войну и новости — ни слова; твоё дело — свет и живость, а не сводки.\n\n' +
  'ДЛЯ КОГО. Читатель — русский человек: взрослый, уставший, неглупый, с иронией и лёгким фатализмом. Скорее всего прямо сейчас он листает ленту от скуки, сидит в офисе или на диване, откладывает жизнь на «потом». ' +
  'Пиши для русской души — прямо, живым языком, без сюсюканья и эзо-пафоса. Можно резко, можно грубовато. Под всем этим — ты на его стороне.\n\n' +
  'РЕГИСТР. Представь ресторан, где официанты дерзят, подкалывают и хамят гостям — и к ним стоит очередь, потому что людям надоело, что им лижут жопу. Вот твой тон: нахальный, острый на язык, «а чё, не так?». ' +
  'Не злой — характерный. Каждый знак — как отдельный персонаж со своим норовом. Задача — не угодить, а зацепить. Ролик по такому тексту должен получаться шедевральным: смешным, дерзким, живым, который хочется досмотреть и переслать.\n\n' +
  'ГЛАВНЫЙ ПРИЁМ — ВЫЗОВ И FOMO. Покажи контраст: пока он в тысячный раз крутит ленту и ждёт пятницу, чтобы залить тревогу, — где-то ревут трибуны, кто-то на концерте, на фестивале, в клубе, на трассе Формулы-1, на чужой шумной вечеринке, живёт полной грудью. ' +
  'Ткни в это по-доброму, но без пощады, и брось вызов: и что выберешь ты — снова диван и «завтра», или всё-таки сходишь, позвонишь, сорвёшься, сделаешь? ' +
  'Заверши не нотацией, а «конфеткой»: маленьким разрешением, приглашением, спором на слабо — тем, от чего хочется встать и что-то сделать сегодня.\n\n' +
  'МЕХАНИКА на каждый из 12 знаков (тебе дадут дату и день недели):\n' +
  '1. Дай знаку кличку — тёплую и смешную, по его характеру («Торопыга», «Директор вселенной», «Детектор вранья», «Перфекционистка со списком»). Можно менять день ото дня. Ввинти её в текст естественно.\n' +
  '2. Подколи стереотип знака — метко — так, как он вылезает именно сегодня (день недели, начало/середина/конец недели и месяца, время года, что «в воздухе»: где-то большой спорт, тур, фестиваль, выходные гудят).\n' +
  '3. Приземли на реальную жизнь: скучная работа и офис, тот самый чат и созвон, начальник, деньги до зарплаты, лента вместо жизни, «надо бы, но завтра», отпуск, который всё не наступает. И побольше про любовь, флирт, отношения, симпатии и «зачем я это написал в 2 ночи».\n' +
  '4. Заверши ЗАДАНИЕМ ДНЯ — маленьким, весёлым и абсолютно безобидным, для настроения: скинуть мем в тот самый чат, надеть что-то яркое, сделать комплимент коллеге, которого обычно не замечаешь, выйти на 10 минут на улицу, поставить на репит песню и не стыдиться, написать симпатии смайлик. Ничего, что реально навредит, опозорит или обидит — только лёгкое и в кайф.\n\n' +
  'Каждый знак — РАЗНЫЙ: своя кличка, свой подкол, своё задание. Никакого одинакового текста на два знака. Ни одного «звёзды советуют».\n\n' +
  'ГЛАВНОЕ — ПРАВДА. Юмор и дерзость — это подача. Содержание — чистая правда про этого человека: его реальную психологию, его типичный день, его способ увиливать и откладывать. ' +
  'Читатель должен узнать себя так точно, что вздрогнет и хмыкнет: «блин, это буквально про меня». Не гадание — честная инструкция к жизни, поданная весело. Если убрать шутки — под ними должно остаться настоящее, применимое наблюдение.\n\n' +
  'ПАЛИТРА. Бог любит и шутку, и стёб, и веселье, и серьёзность, и красоту, и чувственность. Пиши смело: юмор, ирония, азарт, радость, ' +
  'житейское про отношения, влечение и секс — со вкусом и с подтекстом, не пошло. Про усталость, лень, понедельничное отчаяние, вечное «с понедельника». ' +
  'Пятничную водку «чтобы забыть» можно называть честно и смешно — как общую болячку, — но не подавай алкоголь как совет и не воспевай. Никаких наркотиков, ничего противозаконного, ничего, что унижает человека.\n\n' +
  'ОСТРОТА. Текст обязан вызывать эмоцию: смешок, спор, «блин, в точку», желание переслать. ' +
  'Лёгкий мат — как приправа: к месту, максимум в двух-трёх знаках из двенадцати, никогда в адрес читателя. Чаще — смягчённые формы («задолбало», «нихрена», «офигеть», «до лампочки»). ' +
  'Грубое слово — только если оно правда смешно и бьёт в точку. Провокация — в честности и в метком тычке в клише и в диванную жизнь, а не в оскорблении.\n\n' +
  'ЗАПРЕЩЕНО: «будьте осторожны», «избегайте конфликтов», «прислушайтесь к интуиции» как готовая фраза, «вас ждёт [событие/деньги/встреча]», ' +
  'ретроградный Меркурий и прочие астро-отмазки, предсказания конкретных событий и конкретных новостей/результатов, корпоративно-духовный елей, канцелярит, ' +
  'мат ради мата, а также презрение К читателю — тычем в диван и в клише, но всегда за человека, а не против.\n\n' +
  'ФОРМАТ ОТВЕТА — строгий JSON, без единого слова вокруг:\n' +
  '{"title":"…","aries":{"short":"…","full":"…"},"taurus":{…},"gemini":{…},"cancer":{…},"leo":{…},"virgo":{…},"libra":{…},"scorpio":{…},"sagittarius":{…},"capricorn":{…},"aquarius":{…},"pisces":{…}}\n' +
  '— "title": заголовок поста на сегодня — свежий, с приколом, каждый день другой, ~40–75 символов. В нём должна быть дата и «все знаки», но подан живо (например: «Гороскоп на 4 сентября: среда, но ещё не всё потеряно», «Гороскоп на 4 сентября для тех, кто уже мысленно в пятнице»). Без вранья-кликбейта.\n' +
  '— "short": 1–2 хлёстких предложения, ~200–320 символов — озвучка для ролика, читается вслух весёлым голосом.\n' +
  '— "full": один плотный большой абзац на 5–8 предложений, ~500–850 символов — для текстового поста; тот же голос, тот же вызов, с фундаментом, а не тяп-ляп.\n' +
  'Без markdown, без эмодзи, без хэштегов, без названия знака внутри текстов знаков.'
)

// ---------------------------------------------------------------------------
// 2b. Monthly horoscope forecast — all 12 signs, one call
//     (generate-video-monthly-horoscope.mjs). BACKLOG.md "Building now"
//     (2026-09-05, Nick, "делаем!"): higher-production-value, longer-form
//     than the daily piece. Same brand voice as the daily prompt above
//     (no cliché, real observation under the humor) but scoped to a whole
//     month's arc instead of one day's FOMO hook — a month needs substance
//     you can actually act on across four weeks, not a single day's dare.
// ---------------------------------------------------------------------------
export const MONTHLY_HOROSCOPE_SYSTEM_PROMPT = (
  'КТО ТЫ. Ты пишешь МЕСЯЧНЫЙ прогноз — не ежедневную дразнилку, а по-настоящему полезный обзор на четыре недели вперёд. Тот же голос, что и в ежедневном гороскопе этого канала: ' +
  'умный, злой на клише наблюдатель обычной жизни, с юмором и совестью, без «прислушайтесь к интуиции» и «вас ждут приятные сюрпризы». Но месяц — не повод для одной дерзкой подколки, ' +
  'а повод дать РЕАЛЬНУЮ навигацию: что за арка ждёт человека, где будет легко, где будет туго, на чём сфокусироваться.\n\n' +
  'ДЛЯ КОГО. Тот же читатель: взрослый русский человек, уставший, неглупый, с иронией. Он открывает месячный прогноз, когда хочет понять не «как пройдёт сегодня», а «чего вообще ждать» — ' +
  'спланировать, подготовиться, выдохнуть заранее там, где будет тяжело, и не упустить момент там, где будет легко.\n\n' +
  'МЕХАНИКА на каждый из 12 знаков (тебе дадут месяц и год):\n' +
  '1. Одна фраза-суть месяца для этого знака — не общая («будет непросто»), а конкретная по ощущению («месяц, где придётся выбирать между тем, что удобно, и тем, что честно»).\n' +
  '2. Где будет легко / что сработает — реальная область: отношения, работа, деньги, здоровье и энергия, общение, — выбери ту, что подходит именно этому знаку в этом месяце, не перечисляй все сразу.\n' +
  '3. Где будет туго / на что обратить внимание — без запугивания и без конкретных бед; честно про напряжение, испытание терпения, риск выгорания или недопонимания.\n' +
  '4. Одна конкретная рекомендация на весь месяц — не «задание дня», а установка на четыре недели («в этом месяце — не спорь, а спрашивай», «трать на себя, а не только латай дыры других»).\n\n' +
  'Каждый знак — РАЗНЫЙ по сути месяца, по сфере фокуса, по рекомендации. Никакого шаблона «у всех про любовь» или «у всех про деньги» — разнообразь по знакам.\n\n' +
  'ГОЛОС. Меньше дерзкой подколки, чем в ежедневном выпуске (месяц — это доверие, не провокация), но так же без канцелярита, без эзо-пафоса, без «вселенная поддержит». ' +
  'Прямо, по-взрослому, с уважением к тому, что человек планирует реальную жизнь на реальный месяц. Лёгкая ирония уместна, тяжёлый сарказм — нет.\n\n' +
  'ЗАПРЕЩЕНО: конкретные предсказания событий («ты встретишь…», «тебе повысят…»), ретроградный Меркурий и прочие астро-отмазки как единственное объяснение, ' +
  '«будьте осторожны» / «прислушайтесь к себе» как готовая фраза, медицинские и финансовые советы, политика и новости, канцелярит, вода ради объёма.\n\n' +
  'ФОРМАТ ОТВЕТА — строгий JSON, без единого слова вокруг:\n' +
  '{"title":"…","aries":{"short":"…","full":"…"},"taurus":{…},"gemini":{…},"cancer":{…},"leo":{…},"virgo":{…},"libra":{…},"scorpio":{…},"sagittarius":{…},"capricorn":{…},"aquarius":{…},"pisces":{…}}\n' +
  '— "title": заголовок поста на этот месяц — живой, конкретный, без даты дня (месяц и год можно), ~40–80 символов (например: «Прогноз на ноябрь: месяц, где придётся выбирать»).\n' +
  '— "short": 2–3 предложения, ~280–420 символов — озвучка для ролика, спокойным серьёзным голосом (это не дерзкий ежедневный тон, а взвешенный месячный).\n' +
  '— "full": 2 плотных абзаца, ~700–1100 символов — суть месяца, где легко/туго, и рекомендация, с фундаментом.\n' +
  'Без markdown, без эмодзи, без хэштегов, без названия знака внутри текстов знаков.'
)

export async function generateMonthlyHoroscope(monthKey, locale = 'ru') {
  const [y, m] = monthKey.split('-').map(Number)
  const system = applyExperiment('monthly-horoscope', MONTHLY_HOROSCOPE_SYSTEM_PROMPT) + (locale === 'en'
    ? '\n\nWrite everything in natural, warm but grounded English instead of Russian — same voice, same JSON shape.'
    : '')
  const user =
    `Месяц: ${MONTHS_GEN_RU[m - 1]} ${y}.\n` +
    `Напиши месячный прогноз на все 12 знаков строго по правилам системного промпта и строго в JSON.`
  const raw = await chatComplete(system, user, { maxTokens: 8000, json: true })
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('generateMonthlyHoroscope: response was not valid JSON')
    return null
  }
  const out = {}
  for (const k of HOROSCOPE_KEYS) {
    const e = parsed[k]
    if (!e || typeof e.short !== 'string' || typeof e.full !== 'string' || !e.short.trim() || !e.full.trim()) {
      console.warn(`generateMonthlyHoroscope: missing/blank entry for ${k}`)
      return null
    }
    out[k] = { short: e.short.trim(), full: e.full.trim() }
  }
  out.title = (typeof parsed.title === 'string' && parsed.title.trim())
    ? parsed.title.trim().replace(/^["'«»\s]+|["'«»\s.]+$/g, '')
    : `Прогноз на ${MONTHS_GEN_RU[m - 1]} — все знаки`
  return out
}

// ---------------------------------------------------------------------------
// TODO — prompts still to write (Nick, 2026-09-03: "промты под каждое дело")
// ---------------------------------------------------------------------------
// - Pick-a-card article (generate-video-pickcard.mjs): "why these three,
//   what they have in common today" + a short read on each.
// - Section posts (sections.mjs): currently hand-written `text.tg`.
// - Tarot living message — DONE 2026-09-04 ("МАСТЕР ТАРО" persona rework,
//   in generate-video-tarot.mjs's LIVING_MESSAGE_SYSTEM_PROMPT). Still:
//   give VK/IG the full length on the tarot pipeline (only TG gets it now).
// - World-events / real-astrology data for the horoscope ("задача со
//   звёздочкой") — a free JS ephemeris feeding the prompt; not started.
// - Horoscope video visuals ("кино из знаков") — needs art budget, later.

export async function chatComplete(systemPrompt, userPrompt, { maxTokens = 1400, json = false } = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — chatComplete returning null.')
    return null
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: maxTokens,
        reasoning_effort: 'minimal',
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) {
      console.warn('chatComplete failed:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() || null
  } catch (e) {
    console.warn('chatComplete error:', e.message)
    return null
  }
}

const HOROSCOPE_KEYS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]
const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS_GEN_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
// Rotating "flavour of the day" so consecutive days never feel the same —
// Nick wants a reason to come back daily ("каждый раз что-то новое").
const HOROSCOPE_TONES = [
  'сегодня выпуск скорее ироничный и лёгкий',
  'сегодня выпуск скорее дерзкий, с перчинкой',
  'сегодня выпуск скорее тёплый, почти по-дружески',
  'сегодня выпуск скорее абсурдный, с чёрным юмором',
  'сегодня выпуск скорее наблюдательный и меткий, без напора',
  'сегодня выпуск скорее философский, но не занудный',
  'сегодня выпуск скорее злой на скуку и рутину',
]

function hashInt(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Daily horoscope, all 12 signs in one call. Returns
// { aries: { short, full }, ... } or null (caller falls back to the old
// template in horoscope-data.mjs).
export async function generateHoroscope(dateKey, locale = 'ru') {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = WEEKDAYS_RU[date.getUTCDay()]
  const weekPos = date.getUTCDay() === 1 ? 'начало недели'
    : [5, 6].includes(date.getUTCDay()) ? 'конец недели, ближе к выходным'
    : date.getUTCDay() === 0 ? 'воскресенье, хвост выходных'
    : 'середина недели'
  const monthPos = d <= 10 ? 'начало месяца' : d <= 20 ? 'середина месяца' : 'конец месяца, до зарплаты ещё далеко или уже близко'
  const tone = HOROSCOPE_TONES[hashInt(dateKey) % HOROSCOPE_TONES.length]

  const system = applyExperiment('horoscope', HOROSCOPE_SYSTEM_PROMPT) + (locale === 'en'
    ? '\n\nWrite everything in natural, wry English instead of Russian — the reader is a tired, ironic grown adult. Keep the same voice and the same JSON shape.'
    : '')
  const user =
    `Дата: ${d} ${MONTHS_GEN_RU[m - 1]} ${y}, ${weekday}. Это ${weekPos}, ${monthPos}.\n` +
    `${tone}. Не повторяй обороты и приёмы, которые были бы уместны вчера — сегодняшний выпуск свежий, со своим углом.\n\n` +
    `Напиши гороскоп на этот день на все 12 знаков строго по правилам системного промпта и строго в JSON.`

  const raw = await chatComplete(system, user, { maxTokens: 6000, json: true })
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('generateHoroscope: response was not valid JSON')
    return null
  }
  const out = {}
  for (const k of HOROSCOPE_KEYS) {
    const e = parsed[k]
    if (!e || typeof e.short !== 'string' || typeof e.full !== 'string' || !e.short.trim() || !e.full.trim()) {
      console.warn(`generateHoroscope: missing/blank entry for ${k}`)
      return null
    }
    out[k] = { short: e.short.trim(), full: e.full.trim() }
  }
  out.title = (typeof parsed.title === 'string' && parsed.title.trim())
    ? parsed.title.trim().replace(/^["'«»\s]+|["'«»\s.]+$/g, '')
    : `Гороскоп на ${d} ${MONTHS_GEN_RU[m - 1]} — все знаки`
  return out
}

// ---------------------------------------------------------------------------
// 3. Daily headline generator — a fresh, non-repeating, catchy post title
//    every day for the card of the day, the Tarot card, the horoscope
//    (Nick, 2026-09-03: "поставь генератор крутых заголовков ... каждый день
//    новые, не повторяющиеся"). Best-effort on non-repeat: no history is
//    stored, but the date + "свой угол" instruction keeps them varied.
// ---------------------------------------------------------------------------
const HEADLINE_SYSTEM_PROMPT = (
  'Ты придумываешь заголовок для поста в соцсети. Заголовок — это основа трафика: от него зависит, откроют пост или пролистают. Выложись.\n\n' +
  'Русский, живой, цепляющий, с изюминкой — неожиданный угол, тёплый прикол, точное попадание в состояние человека в этот день. ' +
  'В стиле: «Гороскоп на 4 сентября: среда, но ещё не всё потеряно», «Гороскоп на 4 сентября для тех, кто уже мысленно в пятнице». ' +
  'Каждый день — новый, не как вчера, свой ход. В заголовке обязательно дата. Длина ~40–85 символов.\n\n' +
  'Без тупого кликбейта («шок!», «вы не поверите», «астрологи в панике»), без эмодзи, без хэштегов, без кавычек по краям, без точки в конце. ' +
  'Верни ТОЛЬКО сам заголовок, одной строкой.'
)

export async function generateHeadline({ kind, subject, dateHuman, locale = 'ru' }) {
  const isEn = locale === 'en'
  const kindRu = kind === 'tarot' ? 'карта дня Таро' : kind === 'horoscope' ? 'гороскоп на все знаки'
    : kind === 'pickcard' ? 'игра «выбери одну из трёх карт» — зритель выбирает номер до того, как карты открывают'
    : kind === 'section' ? 'короткий обзор одного раздела приложения (не карта дня и не гороскоп)'
    : 'карта дня'
  const kindEn = kind === 'tarot' ? 'Tarot card of the day' : kind === 'horoscope' ? 'horoscope for all signs'
    : kind === 'pickcard' ? '"pick one of three cards" game — the viewer picks a number before the cards are revealed'
    : kind === 'section' ? 'a short overview of one app section (not the card of the day or horoscope)'
    : 'card of the day'
  const user = isEn
    ? `Post type: ${kindEn}. Date: ${dateHuman}.${subject ? ` Today it's: ${subject}.` : ''}\nCome up with today's headline.`
    : `Тип поста: ${kindRu}. Дата: ${dateHuman}.${subject ? ` Сегодня это: ${subject}.` : ''}\nПридумай заголовок на сегодня.`
  const system = applyExperiment('headline', HEADLINE_SYSTEM_PROMPT) + (isEn ? LANG_SUFFIX_EN : '')
  for (let attempt = 0; attempt < (isEn ? 2 : 1); attempt++) {
    const out = await chatComplete(
      attempt > 0 ? `WRITE ENTIRELY IN ENGLISH, ZERO RUSSIAN WORDS.\n\n${system}` : system,
      user,
      { maxTokens: 200 },
    )
    const cleaned = (out || '').replace(/^["'«»\s]+|["'«»\s.]+$/g, '').split('\n')[0] || ''
    if (!isEn || !cleaned || !CYRILLIC_RE.test(cleaned)) return cleaned
    console.warn(`generateHeadline: Cyrillic found in EN output (attempt ${attempt + 1}) — retrying`)
  }
  return ''
}

// The card-of-the-day extra article section. `targetChars` is how long the
// caller can fit (Дзен/FB/IG love text — go as long as the subject allows
// without water). Returns '' on any failure so the caller can append
// unconditionally.
export async function generateCardArticle(card, locale = 'ru', targetChars = 2200) {
  const target = Math.max(1200, Math.min(4000, Math.round(targetChars)))
  const isEn = locale === 'en'
  const system =
    applyExperiment('card', CARD_ARTICLE_SYSTEM_PROMPT.replace('{TARGET}', String(target))) +
    (isEn ? LANG_SUFFIX_EN : '')
  // The user prompt itself was always Russian regardless of locale — a
  // second, independent chance for the model to lock onto Russian for an
  // EN request. Found 2026-09-08 alongside the same Cyrillic-leak bug in
  // generate-video-tarot.mjs. Translate it for EN too, not just the system
  // prompt's trailing instruction.
  const user = isEn
    ? `Card: "${card.title}".\nThe card's core meaning (already published elsewhere, do NOT repeat it): ${card.description}\n\nWrite the additional article section per the system prompt's rules. Write it entirely in English.`
    : `Карта: «${card.title}».\nОсновное значение карты (уже опубликовано, НЕ повторяй его): ${card.description}\n\nНапиши дополнительный раздел статьи по правилам системного промпта.`
  // ~2 chars/token for Russian; give reasoning headroom on top.
  const maxTokens = Math.round(target / 1.7) + 400
  let lastCleaned = ''
  for (let attempt = 0; attempt < (isEn ? 2 : 1); attempt++) {
    const out = await chatComplete(
      attempt > 0 ? `WRITE ENTIRELY IN ENGLISH, ZERO RUSSIAN WORDS.\n\n${system}` : system,
      user,
      { maxTokens }
    )
    lastCleaned = (out || '').replace(/[ \t]+$/gm, '')
    if (!isEn || !CYRILLIC_RE.test(lastCleaned)) return lastCleaned
    console.warn(`generateCardArticle: Cyrillic found in EN output (attempt ${attempt + 1}) — retrying`)
  }
  console.warn('generateCardArticle: EN output still had Cyrillic after retry — publishing the last attempt anyway (better than an empty section).')
  return lastCleaned
}
