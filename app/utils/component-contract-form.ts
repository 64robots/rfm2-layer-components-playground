import type { ComponentsCatalogDetailPayload } from '../types/components-playground'

export type FormSection = 'payload' | 'config'

export type JsonSchemaProperty = {
  type?: string | string[]
  enum?: unknown[]
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  $ref?: string
  oneOf?: JsonSchemaProperty[]
  const?: unknown
  $defs?: Record<string, JsonSchemaProperty>
}

export type FormField = {
  id: string
  label: string
  description?: string
  path: string[]
  required: boolean
  section: FormSection
  schema: JsonSchemaProperty
  multiline: boolean
  disabled: boolean
  customType?: 'media-asset'
}

export const MEDIA_REFERENCE_KEYS = new Set(['src', 'url', 'imageUrl', 'thumbnailUrl', 'mediaUuid'])
export const MULTILINE_FIELD_PATTERN = /(body|instructions|description|note|text|content|transcript)/i

export function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

export function getSchemaType(schema: JsonSchemaProperty | undefined): string | null {
  if (!schema) {
    return null
  }

  if (Array.isArray(schema.type)) {
    return schema.type.find((value) => value !== 'null') || null
  }

  return typeof schema.type === 'string' ? schema.type : null
}

export function collectSchemaFields(
  out: FormField[],
  schema: JsonSchemaProperty | undefined,
  section: FormSection,
  path: string[],
  parentRequired: string[] = [],
) {
  const properties = schema?.properties
  if (!properties || typeof properties !== 'object') {
    return
  }

  const required = Array.isArray(schema.required) ? schema.required : parentRequired

  Object.entries(properties).forEach(([key, property]) => {
    const nextPath = [...path, key]
    const baseType = getSchemaType(property)

    if (baseType === 'object' && property.properties && nextPath.length <= 3) {
      collectSchemaFields(out, property, section, nextPath, Array.isArray(property.required) ? property.required : [])
      return
    }

    if (baseType === 'array') {
      return
    }

    if (baseType === 'string' || baseType === 'number' || baseType === 'boolean' || Array.isArray(property.enum)) {
      out.push({
        id: nextPath.join('.'),
        label: property.title || humanizeKey(key),
        description: property.description,
        path: nextPath,
        required: required.includes(key),
        section,
        schema: property,
        multiline: baseType === 'string' && MULTILINE_FIELD_PATTERN.test(nextPath.join('.')),
        disabled: MEDIA_REFERENCE_KEYS.has(key),
      })
    }
  })
}

export function buildFormFieldsFromCompiledContract(
  compiledContract: Record<string, unknown> | null | undefined,
): FormField[] {
  if (!compiledContract || typeof compiledContract !== 'object') {
    return []
  }

  const fields: FormField[] = []
  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty }, config?: { schema?: JsonSchemaProperty } }
  collectSchemaFields(fields, contract.payload?.schema, 'payload', ['payload'])
  collectSchemaFields(fields, contract.config?.schema, 'config', ['config'])
  return fields
}

export function buildFormFieldsFromDetail(detail: ComponentsCatalogDetailPayload | null | undefined): FormField[] {
  return buildFormFieldsFromCompiledContract(detail?.compiledContract ?? null)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getValueAtPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined
    }

    return current[segment]
  }, source)
}

export function setValueAtPath(source: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  let current: Record<string, unknown> = source

  path.forEach((segment, index) => {
    const isLeaf = index === path.length - 1

    if (isLeaf) {
      current[segment] = value
      return
    }

    const existing = current[segment]
    if (!isRecord(existing)) {
      current[segment] = {}
    }

    current = current[segment] as Record<string, unknown>
  })

  return source
}

export function cloneDraftValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T
}

export function normalizePropsDraft(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const next = cloneDraftValue(value || {})
  if (!isRecord(next.payload)) {
    next.payload = {}
  }
  if (!isRecord(next.config)) {
    next.config = {}
  }
  if (!isRecord(next.interactionState)) {
    next.interactionState = {}
  }
  return next
}

export function applyFieldUpdateToDraft(
  draft: Record<string, unknown>,
  field: FormField,
  value: unknown,
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)

  if (getSchemaType(field.schema) === 'number') {
    const parsed = Number(value)
    setValueAtPath(next, field.path, Number.isNaN(parsed) ? value : parsed)
  } else if (getSchemaType(field.schema) === 'boolean') {
    setValueAtPath(next, field.path, Boolean(value))
  } else {
    setValueAtPath(next, field.path, value)
  }

  return next
}
