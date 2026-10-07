export type EnumSelectValue = string | number | boolean

export type EnumSelectPresentation = {
  values: EnumSelectValue[]
  modelValue: EnumSelectValue | undefined
  status: 'ready' | 'empty' | 'unsupported_schema' | 'invalid_value'
  message: string | null
  isDisabled: boolean
}

function isEnumSelectValue(value: unknown): value is EnumSelectValue {
  return typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

/** Present supported enum values without changing authored schema or draft data. */
export function resolveEnumSelectPresentation(enumValues: unknown, raw: unknown): EnumSelectPresentation {
  if (!Array.isArray(enumValues) || !enumValues.every(isEnumSelectValue)) {
    return { values: [], modelValue: undefined, status: 'unsupported_schema',
      message: 'This field has options the editor cannot display. Your draft has not been changed.', isDisabled: true }
  }
  const values = enumValues
  if (raw === undefined || raw === null) {
    return { values, modelValue: undefined, status: 'empty', message: null, isDisabled: false }
  }
  if (isEnumSelectValue(raw) && values.includes(raw)) {
    return { values, modelValue: raw, status: 'ready', message: null, isDisabled: false }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of ['value', 'id', 'name', 'key']) {
      const value: unknown = Reflect.get(raw, key)
      if (isEnumSelectValue(value) && values.includes(value)) {
        return { values, modelValue: value, status: 'ready', message: null, isDisabled: false }
      }
    }
  }
  return { values, modelValue: undefined, status: 'invalid_value',
    message: 'The current value does not match an available option. Choose an option to replace it.', isDisabled: false }
}
