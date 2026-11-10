import assert from 'node:assert/strict'
import { test } from 'node:test'
import { removePayloadArrayItemAt } from '../app/utils/component-contract-form'

test('explicit minimum preserves required rows and leaves the draft unchanged', () => {
  const draft = { payload: { questions: [{ id: 'first' }] } }
  const before = structuredClone(draft)
  assert.equal(removePayloadArrayItemAt(draft, ['payload', 'questions'], 0, 1), null)
  assert.deepEqual(draft, before)
})

test('normal removal returns a record with preceding rows intact', () => {
  const draft = { payload: { questions: [{ id: 'first' }, { id: 'second' }] } }
  const before = structuredClone(draft)
  assert.deepEqual(removePayloadArrayItemAt(draft, ['payload', 'questions'], 1, 1), {
    payload: { questions: [{ id: 'first' }] }, config: {}, interactionState: {},
  })
  assert.deepEqual(draft, before)
})

test('helper requires an explicit minimum independently of the wrapper guard', () => {
  const draft = { payload: { questions: [{ id: 'first' }] } }
  const uncontrolled = Reflect.apply(removePayloadArrayItemAt, undefined, [draft, ['payload', 'questions'], 0])
  assert.deepEqual(uncontrolled, { payload: { questions: [] }, config: {}, interactionState: {} })
})
