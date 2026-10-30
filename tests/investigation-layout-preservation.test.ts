// --- Imports: Test Framework ---
import assert from 'node:assert/strict'
import { test } from 'node:test'

// --- Imports: Subject ---
import {
  applyInvestigationFilePositionToPayload,
  padPayloadArraysFromContract,
} from '../app/utils/component-contract-form'

// --- Test Suite ---
for (const count of [4, 13]) {
  test(`passive hydration preserves ${count} implicit files and authored content`, () => {
    const draft = {
      payload: {
        files: Array.from({ length: count }, (_, index) => ({
          id: `evidence-${index}`, title: `Evidence ${index}`, mediaUuid: `media-${index}`,
        })),
        testOfControls: { groups: [{ id: 'group', objectives: [{ id: 'objective' }] }] },
        questions: [{ id: 'question', prompt: 'Keep the authored question' }],
      },
      config: { evidenceCompanion: 'test-of-controls' },
      interactionState: {},
    }
    const before = structuredClone(draft)
    const contract = { payload: { schema: { properties: {
      files: { type: 'array', minItems: 1, items: { type: 'object', properties: {
        id: { type: 'string' }, title: { type: 'string' },
      } } },
    } } } }
    const hydrated = padPayloadArraysFromContract(draft, contract, { componentSlug: 'investigation' })
    const reopened = padPayloadArraysFromContract(hydrated, contract, { componentSlug: 'investigation' })
    assert.deepEqual(hydrated, before)
    assert.deepEqual(reopened, before)
    assert.deepEqual(draft, before)
  })
}

test('passive hydration preserves explicit and partial positions exactly', () => {
  const draft = {
    payload: { files: [
      { id: 'explicit', position: { x: 22.4, y: 51.7, rotation: -2.1 } },
      { id: 'partial', position: { x: 15 } },
      { id: 'implicit' },
    ] },
    config: {}, interactionState: {},
  }
  assert.deepEqual(padPayloadArraysFromContract(draft, null), draft)
})

test('an actual drag persists only the intended file through reopen', () => {
  const draft = {
    payload: { files: [{ id: 'dragged' }, { id: 'untouched' }] },
    config: {}, interactionState: {},
  }
  const hydrated = padPayloadArraysFromContract(draft, null)
  assert.equal(applyInvestigationFilePositionToPayload(hydrated, 'dragged', {
    x: 31.2, y: 46.7, rotation: -1.5,
  }), true)
  const expected = { ...draft, payload: { files: [
    { id: 'dragged', position: { x: 31.2, y: 46.7, rotation: -1.5 } },
    { id: 'untouched' },
  ] } }
  assert.deepEqual(padPayloadArraysFromContract(hydrated, null), expected)
  assert.deepEqual(draft.payload.files, [{ id: 'dragged' }, { id: 'untouched' }])
})
