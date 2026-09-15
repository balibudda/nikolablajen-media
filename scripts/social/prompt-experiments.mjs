// Live A/B addenda for the content prompts. Nick, 2026-09-04:
// "раз ты видишь что лучше заходит — применяй как дополнение к промту, потом
// отслеживай, как это повлияло, и подкручивай метрики".
//
// Each experiment is a short block appended to a base system prompt for one
// content kind. The weekly review (Claude, via social-analytics + the admin
// panel) checks the metric it targets, then edits/retires it here and logs
// the verdict in PROMPT-EXPERIMENTS.md. Keep this file the single source of
// truth for what's currently layered on top of the base prompts.
//
// kind: 'card' | 'horoscope' | 'tarot' | 'headline'

export const EXPERIMENTS = [
  {
    id: 'E1',
    kind: 'headline',
    started: '2026-09-04',
    status: 'active',
    // Grounded in the first YT analytics pass: calendar/topical hooks
    // ("Полнолуние 28 августа") far outperformed generic/"path pitch"
    // titles on both views and click-through.
    hypothesis: 'Заголовок с конкретным «крючком дня» (событие, календарь, узнаваемое состояние) поднимает CTR против общих формулировок.',
    metric: 'YouTube: показы→просмотры, средний % досмотра первых секунд',
    text:
      'ДОП. ПРАВИЛО (эксперимент E1): в заголовке обязателен конкретный крючок именно этого дня — календарная привязка (день недели, до зарплаты, канун выходных), реальное событие или узнаваемое состояние читателя. ' +
      'Без крючка — заголовок не годится. Общие формулировки («что ждёт знаки», «прогноз на день») запрещены.',
  },
  {
    id: 'E2',
    kind: 'card',
    started: '2026-09-04',
    status: 'active',
    hypothesis: 'Если первая фраза сразу даёт читателю выгоду/образ (а не разгон «сегодня поговорим»), удержание на видео и дочитывания в Дзене растут.',
    metric: 'YouTube средний % досмотра; Дзен дочитывания',
    text:
      'ДОП. ПРАВИЛО (эксперимент E2): первое предложение — сразу по существу, с конкретным образом или пользой для читателя. ' +
      'Никакого разгона, вступлений и представления темы. Читатель должен зацепиться за первую строку.',
  },
  {
    id: 'E3',
    kind: 'horoscope',
    started: '2026-09-04',
    status: 'active',
    hypothesis: 'Вынести самый цепляющий/смешной знак и мысль в первые 3 секунды видео (до общего вступления) удерживает зрителя дольше.',
    metric: 'YouTube средний % досмотра гороскоп-видео, удержание 0–5 сек',
    text:
      'ДОП. ПРАВИЛО (эксперимент E3): в поле "title" дай не нейтральный заголовок, а самую сочную, конкретную мысль дня — такую, ради которой зритель останется смотреть. ' +
      'Она пойдёт на экран в первые секунды ролика.',
  },
]

// Returns the base prompt with every active addendum for `kind` appended.
export function applyExperiment(kind, basePrompt) {
  const add = EXPERIMENTS.filter((e) => e.kind === kind && e.status === 'active')
    .map((e) => e.text)
    .join('\n\n')
  return add ? `${basePrompt}\n\n${add}` : basePrompt
}

// For logging / the weekly review.
export function activeExperiments() {
  return EXPERIMENTS.filter((e) => e.status === 'active')
}
