// Verified real astronomical/astrological events, 2026-2027 — for the
// "event-based content calendar" idea (BACKLOG.md "Building now",
// 2026-09-05, Studio's own pitch: "Коридор затмений — самый мощный
// поисковый тренд"). Dates pulled via live web search 2026-09-05 (this repo
// has no ephemeris library) — cross-check before reusing past 2027 or if
// this file hasn't been touched in a while, sources drift/get corrected.
//
// Sources:
// - Eclipses: almanac.com/eclipses, timeanddate.com/eclipse/2026,
//   timeanddate.com/eclipse/2027 (checked 2026-09-05)
// - Mercury retrograde: almanac.com/content/mercury-retrograde-dates,
//   chani.com/this-year/key-dates/2026-astrological-key-dates-mercury-retrogrades
//   (checked 2026-09-05)
//
// Each event: { id, kind, start, end (optional, same as start if instant),
// title: {ru,en}, blurb: {ru,en} — a short "what this means" line the
// generator scripts turn into narration/captions }.
export const ASTRO_EVENTS = [
  {
    id: 'mercury-rx-2026-10',
    kind: 'mercury-retrograde',
    start: '2026-10-24',
    end: '2026-11-13',
    title: { ru: 'Ретроградный Меркурий', en: 'Mercury Retrograde' },
    blurb: {
      ru: 'С 24 октября по 13 ноября Меркурий идёт ретроградно. Классический совет на этот период: перечитывать документы и сообщения перед отправкой, не подписывать важное впопыхах, делать резервные копии техники, закладывать время на задержки в дороге и переговорах. Не катастрофа — просто период, где торопиться дороже, чем обычно.',
      en: 'From October 24 to November 13, Mercury goes retrograde. The classic advice for this stretch: reread documents and messages before sending, avoid signing anything important in a rush, back up your devices, and build in extra time for travel and negotiations to slip. Not a disaster — just a stretch where rushing costs more than usual.',
    },
  },
  {
    id: 'mercury-rx-2027-02',
    kind: 'mercury-retrograde',
    start: '2027-02-09',
    end: '2027-03-03',
    title: { ru: 'Ретроградный Меркурий', en: 'Mercury Retrograde' },
    blurb: {
      ru: 'С 9 февраля по 3 марта Меркурий снова ретрограден. Тот же принцип: перепроверяй важное, не спеши с решениями, которые легко отменить позже.',
      en: 'From February 9 to March 3, Mercury turns retrograde again. Same principle: double-check anything important, and don’t rush decisions that are hard to undo later.',
    },
  },
  {
    id: 'eclipse-corridor-2027-02',
    kind: 'eclipse-corridor',
    start: '2027-02-06',
    end: '2027-02-21',
    title: { ru: 'Коридор затмений', en: 'Eclipse Corridor' },
    blurb: {
      ru: 'С 6 по 21 февраля — коридор затмений: кольцеобразное солнечное 6 февраля и полутеневое лунное 20–21 февраля. Традиционно это время воспринимают как ускоренную перезагрузку — то, что назревало, может резко проясниться или завершиться. Не повод для тревоги, повод для честности с собой: что из старого действительно пора отпустить.',
      en: 'From February 6 to 21 — an eclipse corridor: an annular solar eclipse on February 6 and a penumbral lunar eclipse on February 20–21. Traditionally seen as a fast-forward reset — things that have been building can suddenly become clear or wrap up. Not a reason for alarm, a reason for honesty: what from the old chapter is actually ready to be let go.',
    },
  },
  {
    id: 'mercury-rx-2027-06',
    kind: 'mercury-retrograde',
    start: '2027-06-10',
    end: '2027-07-04',
    title: { ru: 'Ретроградный Меркурий', en: 'Mercury Retrograde' },
    blurb: {
      ru: 'С 10 июня по 4 июля — очередной ретроградный Меркурий. Перепроверяй детали, не запускай важное впритык к дедлайну.',
      en: 'June 10 to July 4 — another Mercury retrograde. Double-check the details, and don’t launch anything important right up against a deadline.',
    },
  },
  {
    id: 'eclipse-corridor-2027-08',
    kind: 'eclipse-corridor',
    start: '2027-07-18',
    end: '2027-08-17',
    title: { ru: 'Коридор затмений', en: 'Eclipse Corridor' },
    blurb: {
      ru: 'С 18 июля по 17 августа — большой коридор затмений: полутеневое лунное 18 июля, полное солнечное 2 августа, полутеневое лунное 16–17 августа. Три подряд — время не форсировать, а наблюдать, что действительно меняется само.',
      en: 'From July 18 to August 17 — a long eclipse corridor: a penumbral lunar eclipse on July 18, a total solar eclipse on August 2, and another penumbral lunar eclipse on August 16–17. Three in a row — a time to watch what genuinely shifts on its own rather than forcing anything.',
    },
  },
  {
    id: 'mercury-rx-2027-10',
    kind: 'mercury-retrograde',
    start: '2027-10-07',
    end: '2027-10-28',
    title: { ru: 'Ретроградный Меркурий', en: 'Mercury Retrograde' },
    blurb: {
      ru: 'С 7 по 28 октября — последний в 2027 году ретроградный Меркурий. Та же логика: не спеши, перепроверяй, дай себе запас времени.',
      en: 'October 7 to 28 — the last Mercury retrograde of 2027. Same logic: slow down, double-check, and give yourself a buffer.',
    },
  },
]

// Returns the next event whose `start` falls within `leadDays` from `today`
// (default 21 — long enough to post a "heads up" before it begins, per
// Studio's "post before the search spike" reasoning), or null if none.
// `today`/leadDays let callers test deterministically without waiting for
// the real calendar date.
export function nextUpcomingEvent(today = new Date(), leadDays = 21) {
  const todayMs = today.getTime()
  const windowMs = leadDays * 24 * 60 * 60 * 1000
  let best = null
  for (const ev of ASTRO_EVENTS) {
    const startMs = new Date(`${ev.start}T00:00:00Z`).getTime()
    const delta = startMs - todayMs
    if (delta < -24 * 60 * 60 * 1000 || delta > windowMs) continue // already started (>1 day ago) or too far out
    if (!best || startMs < new Date(`${best.start}T00:00:00Z`).getTime()) best = ev
  }
  return best
}
