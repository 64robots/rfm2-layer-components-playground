/**
 * Quiz choice validation for the component contract form (lesson editor, playground).
 * Keep in sync with `rfm-components/activities/quiz-family/payload-choice-validation.ts`.
 */
const CHOICE_KINDS = new Set(['single_select', 'multi_select'])

/**
 * Validates quiz `questions[]` choice rows (single / multi select): min 2 options,
 * non-empty option text, and at least one `isCorrect`. Skips `text` questions.
 */
export function collectQuizChoiceValidationIssues(questions: unknown): string[] {
  if (!Array.isArray(questions)) {
    return []
  }

  const messages: string[] = []

  for (let i = 0; i < questions.length; i++) {
    const raw = questions[i]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue
    }
    const q = raw as Record<string, unknown>
    const kind = typeof q.kind === 'string' ? q.kind : 'single_select'
    if (!CHOICE_KINDS.has(kind)) {
      continue
    }

    const optionsRaw = q.options
    const opts = Array.isArray(optionsRaw)
      ? optionsRaw.filter(
          (o): o is Record<string, unknown> =>
            o !== null && typeof o === 'object' && !Array.isArray(o),
        )
      : []

    const label = `Question ${i + 1}`

    if (opts.length < 2) {
      messages.push(
        `${label}: add at least two answer options for ${kind === 'multi_select' ? 'multi-select' : 'single-select'} questions.`,
      )
      continue
    }

    const blankText = opts.filter(
      o => typeof o.text !== 'string' || !String(o.text).trim(),
    ).length
    if (blankText > 0) {
      messages.push(`${label}: each answer option needs text.`)
    }

    const nCorrect = opts.filter(o => o.isCorrect === true).length
    if (nCorrect < 1) {
      messages.push(`${label}: mark at least one option as correct.`)
    }
  }

  return messages
}
