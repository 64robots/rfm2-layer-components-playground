<script setup lang="ts">
import type { FormField, FormFieldPanel } from '../../utils/component-contract-form'
import {
  appendPayloadArrayItem,
  applyFieldUpdateToDraft,
  exclusiveCorrectArrayPathForField,
  getPayloadArrayDescriptorAtPath,
  getSchemaType,
  getValueAtPath,
  humanizeKey,
  isExclusiveCorrectRadioChecked,
  isNumericSchemaType,
  labelForFormEnumField,
  nestedPayloadListPathsForRow,
  removePayloadArrayItemAt,
} from '../../utils/component-contract-form'

const props = defineProps<{
  listPathStr: string
  allPanels: FormFieldPanel[]
  componentSlug: string
  compiledContract: Record<string, unknown> | null | undefined
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const listDescriptor = computed(() => {
  if (!props.compiledContract) {
    return null
  }
  return getPayloadArrayDescriptorAtPath(
    props.compiledContract,
    props.listPathStr.split('.'),
    { componentSlug: props.componentSlug },
  )
})

const sectionLabel = computed(() => {
  const label = listDescriptor.value?.label?.trim()
  if (label) {
    return label
  }
  const segments = props.listPathStr.split('.').filter(segment => !/^\d+$/.test(segment))
  return humanizeKey(segments[segments.length - 1] || 'items')
})

const addRowLabel = computed(() => {
  const arrayKey = props.listPathStr.split('.').filter(segment => !/^\d+$/.test(segment)).pop() || ''
  if (arrayKey === 'options') {
    return 'Option'
  }
  if (arrayKey === 'questions') {
    return 'Question'
  }
  if (arrayKey === 'questionSets') {
    return 'Question set'
  }
  return sectionLabel.value.endsWith('s') && !sectionLabel.value.endsWith('ss')
    ? sectionLabel.value.slice(0, -1)
    : sectionLabel.value
})

const rows = computed(() => {
  const raw = getValueAtPath(props.modelValue, props.listPathStr.split('.'))
  return Array.isArray(raw) ? raw : []
})

function panelIdForIndex(index: number): string {
  return `${props.listPathStr}.${index}`
}

function panelForIndex(index: number): FormFieldPanel | undefined {
  return props.allPanels.find(panel => panel.id === panelIdForIndex(index))
}

function rowHeading(index: number): string {
  return panelForIndex(index)?.title ?? `${addRowLabel.value} ${index + 1}`
}

function getFieldValue(field: FormField): unknown {
  return getValueAtPath(props.modelValue, field.path)
}

function exclusiveCorrectRadioGroupName(field: FormField): string {
  const arrayPath = exclusiveCorrectArrayPathForField(field)
  return arrayPath
    ? `exclusive-correct-${props.componentSlug}-${arrayPath.join('-')}`
    : `exclusive-correct-${props.componentSlug}`
}

function enumSelectItems(field: FormField): Array<{ label: string, value: string | number }> {
  const enums = field.schema.enum
  if (!Array.isArray(enums)) {
    return []
  }
  return enums.map(value => ({
    label: labelForFormEnumField(props.componentSlug, field, String(value)),
    value: value as string | number,
  }))
}

function updateField(field: FormField, value: unknown) {
  emit('update:modelValue', applyFieldUpdateToDraft(props.modelValue, field, value))
}

function addRow() {
  const descriptor = listDescriptor.value
  if (!descriptor) {
    return
  }
  emit('update:modelValue', appendPayloadArrayItem(props.modelValue, descriptor.arrayPath, descriptor.itemTemplate))
}

function removeLastRow() {
  const descriptor = listDescriptor.value
  if (!descriptor || rows.value.length <= descriptor.minItems) {
    return
  }
  emit('update:modelValue', removePayloadArrayItemAt(props.modelValue, descriptor.arrayPath, rows.value.length - 1))
}
</script>

<template>
  <div
    v-if="listDescriptor"
    class="rounded-md border border-default bg-elevated/40 p-3"
  >
    <p class="mb-2 text-xs font-semibold text-highlighted">
      {{ sectionLabel }}
    </p>

    <div v-if="rows.length === 0" class="mb-2 text-xs text-muted">
      No {{ sectionLabel.toLowerCase() }} yet.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(_, index) in rows"
        :key="panelIdForIndex(index)"
        class="rounded-md border border-default bg-default/25 p-2.5"
      >
        <p class="mb-2 text-sm font-semibold text-highlighted">
          {{ rowHeading(index) }}
        </p>

        <div v-if="panelForIndex(index)" class="space-y-2">
          <div
            v-for="field in panelForIndex(index)!.fields"
            :key="field.id"
            class="space-y-2 rounded-md border border-default/60 bg-default/40 p-2"
          >
            <div>
              <div class="text-sm font-medium text-highlighted">
                {{ field.label }}
                <span v-if="field.required" class="text-error">*</span>
              </div>
              <div v-if="field.description" class="mt-0.5 text-xs text-muted">
                {{ field.description }}
              </div>
            </div>

            <input
              v-if="field.customType === 'scheme-correct-radio'"
              type="radio"
              class="size-4 shrink-0 accent-primary"
              :name="exclusiveCorrectRadioGroupName(field)"
              :checked="isExclusiveCorrectRadioChecked(modelValue, field)"
              :disabled="field.disabled"
              :aria-label="field.label"
              @change="updateField(field, true)"
            >

            <UCheckbox
              v-else-if="getSchemaType(field.schema) === 'boolean'"
              :model-value="Boolean(getFieldValue(field))"
              :disabled="field.disabled"
              @update:model-value="(value) => updateField(field, value)"
            />

            <USelect
              v-else-if="Array.isArray(field.schema.enum)"
              :items="enumSelectItems(field)"
              label-key="label"
              value-key="value"
              :model-value="getFieldValue(field)"
              :disabled="field.disabled"
              variant="soft"
              size="sm"
              class="w-full"
              @update:model-value="(value) => updateField(field, value)"
            />

            <UTextarea
              v-else-if="field.multiline"
              :model-value="String(getFieldValue(field) ?? '')"
              :disabled="field.disabled"
              :readonly="Boolean(field.readOnly)"
              :rows="field.section === 'payload' ? 5 : 3"
              variant="soft"
              size="sm"
              class="w-full"
              @update:model-value="(value) => updateField(field, value)"
            />

            <UInput
              v-else
              :type="isNumericSchemaType(field.schema) ? 'number' : 'text'"
              :model-value="String(getFieldValue(field) ?? '')"
              :disabled="field.disabled"
              :readonly="Boolean(field.readOnly)"
              variant="soft"
              size="sm"
              class="w-full"
              @update:model-value="(value) => updateField(field, value)"
            />
          </div>
        </div>

        <div
          v-for="nestedListPath in nestedPayloadListPathsForRow(panelIdForIndex(index), allPanels, modelValue, componentSlug)"
          :key="nestedListPath"
          class="ms-1 mt-2 border-s border-default ps-3"
        >
          <PlaygroundPayloadNestedArrayGroup
            :list-path-str="nestedListPath"
            :all-panels="allPanels"
            :component-slug="componentSlug"
            :compiled-contract="compiledContract"
            :model-value="modelValue"
            @update:model-value="emit('update:modelValue', $event)"
          />
        </div>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-default pt-2">
      <UButton
        size="xs"
        variant="soft"
        @click="addRow"
      >
        Add {{ addRowLabel }}
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!listDescriptor || rows.length <= listDescriptor.minItems"
        @click="removeLastRow"
      >
        Remove last
      </UButton>
    </div>
  </div>
</template>
