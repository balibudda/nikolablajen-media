// Plain-JS mirror of src/data/horoscope.ts, for the blog/social build
// scripts (same convention as DECKS/spreads being duplicated between the
// TS app and these .mjs scripts). Keep both in sync if the pools change.

export const ZODIAC_SIGNS = [
  { key: 'aries', ru: 'Овен', en: 'Aries', emoji: '♈', datesRu: '21 марта — 19 апреля', datesEn: 'Mar 21 – Apr 19', flavorRu: 'Твоя обычная скорость сегодня может быть не преимуществом, а тем, что стоит на секунду придержать.', flavorEn: 'Your usual speed today might be less of an asset and more of a thing worth holding back for a second.' },
  { key: 'taurus', ru: 'Телец', en: 'Taurus', emoji: '♉', datesRu: '20 апреля — 20 мая', datesEn: 'Apr 20 – May 20', flavorRu: 'Твоя тяга к устойчивости сегодня в силе — но кое-где, возможно, ты держишься за привычное дольше, чем нужно.', flavorEn: 'Your pull toward stability is strong today — though in one spot, you might be holding onto the familiar longer than it serves you.' },
  { key: 'gemini', ru: 'Близнецы', en: 'Gemini', emoji: '♊', datesRu: '21 мая — 20 июня', datesEn: 'May 21 – Jun 20', flavorRu: 'Твоя обычная лёгкость на подъём сегодня хорошо сочетается с чуть большим вниманием к деталям.', flavorEn: 'Your usual quickness pairs well today with a little more attention to the fine print.' },
  { key: 'cancer', ru: 'Рак', en: 'Cancer', emoji: '♋', datesRu: '21 июня — 22 июля', datesEn: 'Jun 21 – Jul 22', flavorRu: 'Твоя чувствительность сегодня — не слабость, а точный инструмент, если не спрятать её из осторожности.', flavorEn: 'Your sensitivity today isn\'t a weakness — it\'s a precise instrument, if you don\'t hide it out of caution.' },
  { key: 'leo', ru: 'Лев', en: 'Leo', emoji: '♌', datesRu: '23 июля — 22 августа', datesEn: 'Jul 23 – Aug 22', flavorRu: 'Твоя энергия сегодня заметна другим — вопрос в том, куда именно ты решишь её направить.', flavorEn: 'Your energy is noticeable to others today — the question is exactly where you choose to point it.' },
  { key: 'virgo', ru: 'Дева', en: 'Virgo', emoji: '♍', datesRu: '23 августа — 22 сентября', datesEn: 'Aug 23 – Sep 22', flavorRu: 'Твоё внимание к деталям сегодня сильно как никогда — только не дай ему заслонить общую картину.', flavorEn: 'Your attention to detail is especially sharp today — just don\'t let it crowd out the bigger picture.' },
  { key: 'libra', ru: 'Весы', en: 'Libra', emoji: '♎', datesRu: '23 сентября — 22 октября', datesEn: 'Sep 23 – Oct 22', flavorRu: 'Твоё стремление к балансу сегодня встречает ситуацию, где, возможно, придётся выбрать сторону.', flavorEn: 'Your search for balance today meets a situation where you might actually need to pick a side.' },
  { key: 'scorpio', ru: 'Скорпион', en: 'Scorpio', emoji: '♏', datesRu: '23 октября — 21 ноября', datesEn: 'Oct 23 – Nov 21', flavorRu: 'Твоя способность видеть суть сегодня особенно остра — используй её честно, а не как оружие.', flavorEn: 'Your ability to see straight to the point is especially sharp today — use it honestly, not as a weapon.' },
  { key: 'sagittarius', ru: 'Стрелец', en: 'Sagittarius', emoji: '♐', datesRu: '22 ноября — 21 декабря', datesEn: 'Nov 22 – Dec 21', flavorRu: 'Твоя тяга к движению вперёд сегодня сильна — стоит только уточнить, куда именно ты движешься.', flavorEn: 'Your pull toward moving forward is strong today — it just helps to be clear on exactly where.' },
  { key: 'capricorn', ru: 'Козерог', en: 'Capricorn', emoji: '♑', datesRu: '22 декабря — 19 января', datesEn: 'Dec 22 – Jan 19', flavorRu: 'Твоя дисциплина сегодня работает на тебя — но кое-где ей стоит на время уступить место отдыху.', flavorEn: 'Your discipline is working in your favor today — though in one area, it could stand to make room for rest.' },
  { key: 'aquarius', ru: 'Водолей', en: 'Aquarius', emoji: '♒', datesRu: '20 января — 18 февраля', datesEn: 'Jan 20 – Feb 18', flavorRu: 'Твой независимый взгляд сегодня особенно ясен — но кому-то рядом, возможно, важно, чтобы его услышали.', flavorEn: 'Your independent view is especially clear today — though someone nearby might need to feel heard too.' },
  { key: 'pisces', ru: 'Рыбы', en: 'Pisces', emoji: '♓', datesRu: '19 февраля — 20 марта', datesEn: 'Feb 19 – Mar 20', flavorRu: 'Твоя интуиция сегодня работает точнее обычного — доверься ей чуть больше, чем логике.', flavorEn: 'Your intuition is running sharper than usual today — trust it a little more than logic.' },
]

const MOOD_RU = [
  'День начинается спокойно, но ближе к вечеру обстановка может немного сгуститься.',
  'Внутренний фон сегодня ровный — хороший момент, чтобы разобраться с тем, что давно откладывалось.',
  'Может ощущаться лёгкое напряжение с самого утра — не обязательно повод для тревоги, скорее сигнал притормозить.',
  'Настроение сегодня переменчивое: то, что расстроило утром, к вечеру может выглядеть иначе.',
  'День располагает к разговорам — что-то важное может проясниться именно в диалоге, а не в одиночных размышлениях.',
  'Энергии сегодня немного меньше обычного — это нормально, не всякий день должен быть рекордным.',
  'Внутри может звучать нетерпение — хочется всё решить прямо сейчас, но часть вопросов лучше подождёт до завтра.',
  'День подходит для наведения порядка — в делах, в комнате, в голове.',
  'Возможна лёгкая рассеянность — стоит перепроверить детали там, где обычно полагаешься на автопилот.',
  'Сегодня хорошо заметно, кто рядом настроен на одну волну с тобой, а кто — нет.',
  'День даёт немного больше свободного времени, чем кажется на первый взгляд — стоит присмотреться, куда его деть.',
  'Может всплыть тема, которую, казалось, давно закрыли — не обязательно drama, скорее повод договорить до конца.',
  'Ощущение сегодня скорее наблюдательное: хочется больше смотреть, чем действовать — и это нормально.',
  'День неплохо подходит для того, чтобы сказать «нет» тому, на что обычно не хватает решимости отказать.',
  'Возможен момент, когда кажется, что тебя не понимают — стоит попробовать сказать то же самое другими словами.',
  'Сегодня легче обычного даётся то, что требует терпения — используй это, если есть незавершённые дела.',
]
const MOOD_EN = [
  'The day starts calm, though things may feel a bit denser toward evening.',
  'Your inner state is steady today — a good moment to deal with something you\'ve been putting off.',
  'A light tension may show up first thing in the morning — not necessarily a reason to worry, more a cue to slow down.',
  'Mood is changeable today: what upsets you in the morning may look different by evening.',
  'The day favors conversation — something important might become clear through talking it out, not solo overthinking.',
  'Energy is a little lower than usual today — that\'s fine, not every day has to be a record.',
  'There may be an inner impatience — wanting to settle everything right now, though some of it can wait until tomorrow.',
  'The day suits tidying up — in your tasks, your space, or your head.',
  'A little scatteredness is possible — double-check details you\'d normally leave on autopilot.',
  'Today it\'s easier than usual to notice who\'s actually on your wavelength and who isn\'t.',
  'The day gives you a bit more free time than it looks like at first — worth deciding what to do with it.',
  'A topic you thought was long settled might resurface — not necessarily drama, more a chance to finish the conversation properly.',
  'The overall feel today is more observant than active — you may want to watch more than act, and that\'s fine.',
  'The day is a decent one for saying "no" to something you usually don\'t have the nerve to turn down.',
  'There may be a moment where you feel misunderstood — try saying the same thing in different words.',
  'Whatever requires patience comes a little easier today — good day to use it on something unfinished.',
]
const ADVICE_RU = [
  'Стоит обратить внимание на то, что говорят, а не только на то, что делают.',
  'Хороший момент, чтобы закрыть один маленький долг — себе или кому-то ещё.',
  'Полезно на время отложить решение, которое кажется срочным, но по факту им не является.',
  'Стоит спросить прямо там, где обычно предпочитаешь догадываться.',
  'Хороший день, чтобы позаботиться о теле — сон, вода, движение решают больше, чем кажется.',
  'Полезно один раз честно назвать то, что раздражает, вместо того чтобы копить.',
  'Стоит доверить часть дел кому-то ещё, а не тащить всё в одиночку.',
  'Хороший момент, чтобы вернуться к тому, что забросил на середине.',
  'Полезно заметить, где ты соглашаешься из вежливости, а не потому что действительно хочешь.',
  'Стоит выделить немного времени только для себя, без задач и обязательств.',
  'Хороший день, чтобы поблагодарить кого-то, кого давно стоило.',
  'Полезно посмотреть на ситуацию со стороны — как будто она случилась не с тобой, а с другом.',
  'Стоит записать мысль, которая крутится в голове, а не полагаться, что она сама не забудется.',
  'Хороший момент, чтобы честно спросить себя — «а я вообще этого хочу?» — прежде чем двигаться дальше.',
  'Полезно снизить темп там, где привычно спешишь.',
  'Стоит один раз довериться интуиции больше, чем расчёту.',
]
const ADVICE_EN = [
  'Worth paying more attention to what\'s said than to what\'s done.',
  'Good moment to close out one small debt — to yourself or to someone else.',
  'It helps to postpone a decision that feels urgent but really isn\'t.',
  'Worth asking directly in a spot where you\'d normally rather guess.',
  'A good day to take care of the body — sleep, water, and movement do more than they get credit for.',
  'It helps to name what\'s irritating you once, honestly, instead of stockpiling it.',
  'Worth handing part of the load to someone else instead of carrying all of it alone.',
  'Good moment to go back to something you dropped halfway through.',
  'It helps to notice where you\'re agreeing out of politeness rather than because you actually want to.',
  'Worth setting aside a little time just for yourself, with no tasks or obligations attached.',
  'A good day to thank someone you\'ve been meaning to for a while.',
  'It helps to look at the situation from the outside — as if it happened to a friend, not to you.',
  'Worth writing down the thought that keeps circling instead of trusting it won\'t slip away on its own.',
  'Good moment to honestly ask yourself "do I even want this?" before going further.',
  'It helps to slow down exactly where you\'d normally rush.',
  'Worth trusting intuition a little more than calculation, just this once.',
]
const CLOSING_RU = [
  'Ничего из этого не приговор — просто линза, через которую сегодня удобнее смотреть.',
  'Возьми из этого то, что откликается, и спокойно оставь остальное.',
  'День складывается не из гороскопа, а из того, что ты в нём сделаешь.',
  'Если что-то из этого не про тебя сегодня — значит, просто не про тебя, и это нормально.',
  'Главное здесь — не предсказание, а повод на минуту остановиться и посмотреть на день чуть внимательнее.',
  'Что бы ни принёс день, у тебя есть право пройти его в своём темпе.',
]
const CLOSING_EN = [
  'None of this is a verdict — just a lens that might be useful to look through today.',
  'Take whatever resonates and leave the rest without a second thought.',
  'The day is made by what you do in it, not by a horoscope.',
  'If none of this fits today, it just isn\'t about you today — and that\'s fine.',
  'The point here isn\'t prediction — it\'s a reason to pause for a minute and look at the day a little more closely.',
  'Whatever the day brings, you get to move through it at your own pace.',
]
const LUCKY_COLORS_RU = ['золотой', 'глубокий синий', 'тёплый терракотовый', 'изумрудный', 'серебристый', 'бордовый', 'песочный', 'лавандовый', 'тёмно-зелёный', 'янтарный']
const LUCKY_COLORS_EN = ['gold', 'deep blue', 'warm terracotta', 'emerald', 'silver', 'burgundy', 'sand', 'lavender', 'dark green', 'amber']

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function getDailyHoroscope(signKey, locale, dateKey) {
  const sign = ZODIAC_SIGNS.find((s) => s.key === signKey) ?? ZODIAC_SIGNS[0]
  const date = dateKey
  const mood = locale === 'en' ? MOOD_EN : MOOD_RU
  const advice = locale === 'en' ? ADVICE_EN : ADVICE_RU
  const closing = locale === 'en' ? CLOSING_EN : CLOSING_RU
  const colors = locale === 'en' ? LUCKY_COLORS_EN : LUCKY_COLORS_RU
  const flavor = locale === 'en' ? sign.flavorEn : sign.flavorRu

  const moodLine = mood[hashStr(`${date}|${signKey}|mood`) % mood.length]
  const adviceLine = advice[hashStr(`${date}|${signKey}|advice`) % advice.length]
  const closingLine = closing[hashStr(`${date}|${signKey}|closing`) % closing.length]
  const luckyColor = colors[hashStr(`${date}|${signKey}|color`) % colors.length]
  const luckyNumber = (hashStr(`${date}|${signKey}|number`) % 49) + 1

  return {
    text: [flavor, moodLine, adviceLine, closingLine].join(' '),
    luckyColor,
    luckyNumber,
  }
}
