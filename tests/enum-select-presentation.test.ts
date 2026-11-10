import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEnumSelectPresentation } from '../app/utils/enum-select-presentation'

for (const value of ['choice', 7, true, false]) {
  test(`preserves primitive option ${String(value)} without coercion`, () => {
    const options = ['choice', 7, true, false]
    const result = resolveEnumSelectPresentation(options, value)
    assert.deepEqual(result.values, options)
    assert.equal(result.modelValue, value)
    assert.equal(result.status, 'ready')
    assert.equal(result.isDisabled, false)
  })
}

test('retains existing wrapper-key normalization without mutating the draft', () => {
  for (const key of ['value', 'id', 'name', 'key']) {
    const draft = { [key]: 'choice', extra: ['unchanged'] }
    const before = structuredClone(draft)
    assert.equal(resolveEnumSelectPresentation(['choice'], draft).modelValue, 'choice')
    assert.deepEqual(draft, before)
  }
})

test('rejects the entire unsupported schema without filtering authored options', () => {
  for (const unsupported of [null, ['nested'], { value: 'object' }, Number.NaN]) {
    const options = ['valid', unsupported]
    const before = structuredClone(options)
    const result = resolveEnumSelectPresentation(options, 'valid')
    assert.equal(result.status, 'unsupported_schema')
    assert.equal(result.isDisabled, true)
    assert.ok(result.message)
    assert.deepEqual(options, before)
    assert.deepEqual(result.values, [])
  }
})

test('missing values stay empty while invalid existing values remain repairable', () => {
  for (const raw of [null, undefined]) {
    assert.equal(resolveEnumSelectPresentation(['choice'], raw).status, 'empty')
    assert.equal(resolveEnumSelectPresentation(['choice'], raw).message, null)
  }
  const invalid = { value: 'unknown', saved: 'preserve' }
  const before = structuredClone(invalid)
  const result = resolveEnumSelectPresentation(['choice'], invalid)
  assert.equal(result.status, 'invalid_value')
  assert.equal(result.isDisabled, false)
  assert.ok(result.message)
  assert.deepEqual(invalid, before)
  assert.equal(resolveEnumSelectPresentation([7], '7').status, 'invalid_value')
})

test('current canonical contract enum lists retain every authored option and selection', async (context) => {
  const { existsSync, readdirSync, readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const root = resolve(process.env.RFM_COMPONENTS_DIR ?? new URL('../../rfm-components', import.meta.url).pathname, 'activities')
  let lists = 0
  let options = 0

  function inspect(value: unknown): void {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }
    const enumValues: unknown = Reflect.get(value, 'enum')
    if (Array.isArray(enumValues)) {
      lists += 1
      options += enumValues.length
      const before = structuredClone(enumValues)
      for (const raw of enumValues) {
        const result = resolveEnumSelectPresentation(enumValues, raw)
        assert.equal(result.status, 'ready')
        assert.equal(result.modelValue, raw)
        assert.deepEqual(result.values, before)
      }
      assert.deepEqual(enumValues, before)
    }
    Object.values(value).forEach(inspect)
  }

  for (const directory of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, directory.name, 'contract.json')
    if (!directory.isDirectory() || !existsSync(path)) continue
    const bytes = readFileSync(path)
    const contract: unknown = JSON.parse(bytes.toString('utf8'))
    inspect(contract)
    assert.deepEqual(readFileSync(path), bytes)
  }
  assert.ok(lists > 0)
  context.diagnostic(`Observed ${lists} canonical enum lists and ${options} options; no filtering or coercion.`)
})
