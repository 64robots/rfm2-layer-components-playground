import { afterEach, expect, test, vi } from 'vitest'
import { computed, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import NestedGroup from '../app/components/components-playground/PlaygroundPayloadNestedArrayGroup.vue'
import type { FormField } from '../app/utils/component-contract-form'

const SelectControl = defineComponent({
  props: ['items', 'modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: '<div><button v-for="item in items" :key="String(item.value)" :disabled="disabled" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>',
})

afterEach(() => vi.unstubAllGlobals())

function mountField(enumValues: unknown[], raw: unknown) {
  vi.stubGlobal('computed', computed)
  const field: FormField = { id: 'payload.questions.0.choice', label: 'Choice',
    path: ['payload', 'questions', '0', 'choice'], required: false, section: 'payload',
    schema: { enum: enumValues }, multiline: false, disabled: false }
  const draft = { payload: { questions: [{ choice: raw }] } }
  const wrapper = mount(NestedGroup, {
    props: { listPathStr: 'payload.questions', componentSlug: 'quiz-family', modelValue: draft,
      allPanels: [{ id: 'payload.questions.0', title: 'Question1', order: 0, fields: [field] }],
      compiledContract: { payload: { schema: { type: 'object', properties: {
        questions: { type: 'array', minItems: 1, items: { type: 'object', properties: { choice: field.schema } } },
      } } } } },
    global: { stubs: { USelect: SelectControl, UButton: true } },
  })
  return { wrapper, draft }
}

test('unsupported options show an author warning, disable the control and never emit a replacement', async () => {
  const { wrapper, draft } = mountField(['valid', { unsupported: true }], 'valid')
  const before = structuredClone(draft)
  const control = wrapper.findComponent(SelectControl)
  expect(control.props('disabled')).toBe(true)
  expect(wrapper.get('[role="status"]').text()).toBe('This field has options the editor cannot display. Your draft has not been changed.')
  expect(control.props('items')).toEqual([])
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(draft).toEqual(before)
  wrapper.unmount()
})

for (const raw of ['choice', 7, true, false]) {
  test(`valid selection emits exact ${typeof raw} primitive and keeps the original draft`, async () => {
    const { wrapper, draft } = mountField([raw], undefined)
    const before = structuredClone(draft)
    const control = wrapper.findComponent(SelectControl)
    expect(control.props('disabled')).toBe(false)
    await control.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({ payload: { questions: [{ choice: raw }] } })
    expect(draft).toEqual(before)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })
}
