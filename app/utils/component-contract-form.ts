import type { ComponentsCatalogDetailPayload } from '../types/components-playground'

export type FormSection = 'payload' | 'config'

export type JsonSchemaProperty = {
  type?: string | string[]
  enum?: unknown[]
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  items?: JsonSchemaProperty
  minItems?: number
  maxItems?: number
  $ref?: string
  oneOf?: JsonSchemaProperty[]
  const?: unknown
  $defs?: Record<string, JsonSchemaProperty>
}

export type FormFieldItemPanel = {
  id: string
  title: string
  order: number
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
  customType?: 'media-asset' | 'scheme-correct-radio'
  /** When set, the field belongs to a grouped row (e.g. decision-point Option 1). */
  itemPanel?: FormFieldItemPanel
}

export type FormFieldPanel = {
  id: string
  title: string
  order: number
  fields: FormField[]
}

/**
 * Split fields into top-level scalars vs panels for array-item groups.
 */
export function partitionFieldsByItemPanels(fields: FormField[]): {
  standalone: FormField[]
  panels: FormFieldPanel[]
} {
  const standalone = fields.filter(f => !f.itemPanel)
  const panelMap = new Map<string, { title: string, order: number, fields: FormField[] }>()

  for (const f of fields) {
    if (!f.itemPanel) {
      continue
    }
    const { id, title, order } = f.itemPanel
    const entry = panelMap.get(id) ?? { title, order, fields: [] as FormField[] }
    entry.fields.push(f)
    panelMap.set(id, entry)
  }

  const panels = Array.from(panelMap.entries())
    .map(([id, v]) => ({
      id,
      title: v.title,
      order: v.order,
      fields: v.fields,
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

  return { standalone, panels }
}

export const MEDIA_REFERENCE_KEYS = new Set(['src', 'url', 'imageUrl', 'thumbnailUrl', 'mediaUuid'])
export const MULTILINE_FIELD_PATTERN
  = /(body|instructions|description|note|text|content|transcript|summary|helperText)/i

/** Catalog slugs that use the unified solve-the-case-family contract. */
export function isSolveTheCaseFamilySlug(slug: string | undefined): boolean {
  if (!slug) {
    return false
  }
  return (
    slug === 'solve-the-case-family'
    || slug.startsWith('solve_the_case')
    || slug === 'solve-the-case-connection'
  )
}

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
      // Array-of-object lists are expanded separately from the live draft (see appendArrayObjectScalarFields).
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

const DEFAULT_ARRAY_CAP = 24

function orderKeysWithPreferredHead(
  keys: string[],
  preferred: readonly string[],
  itemProperties: Record<string, JsonSchemaProperty>,
): string[] {
  const preferredSet = new Set<string>(preferred)
  const head = preferred.filter((k) => k in itemProperties)
  const tail = keys.filter((k) => !preferredSet.has(k))
  return [...head, ...tail]
}

/** Per-array-item field order and hidden keys (fraud schemes, solve-the-case suspects & question options). */
function orderedArrayItemPropertyKeys(
  arrayKey: string,
  componentSlug: string | undefined,
  itemProperties: Record<string, JsonSchemaProperty>,
  parentArrayKey?: string,
): string[] {
  const slug = componentSlug || ''
  let keys = Object.keys(itemProperties)

  const isFraudSchemes
    = arrayKey === 'schemes' && (slug === 'fraud-scheme-family' || slug === 'fraud-scheme')
  const isSolveSuspects = isSolveTheCaseFamilySlug(slug) && arrayKey === 'suspects' && !parentArrayKey
  const isSolveQuestionOptions
    = isSolveTheCaseFamilySlug(slug)
      && arrayKey === 'options'
      && parentArrayKey === 'supportingQuestions'

  if (isFraudSchemes || isSolveSuspects || isSolveQuestionOptions) {
    keys = keys.filter((k) => k !== 'id')
  }

  if (isFraudSchemes) {
    return orderKeysWithPreferredHead(keys, ['label', 'description', 'isCorrect'], itemProperties)
  }
  if (isSolveSuspects) {
    return orderKeysWithPreferredHead(keys, ['name', 'summary', 'isCorrect'], itemProperties)
  }
  if (isSolveQuestionOptions) {
    return orderKeysWithPreferredHead(keys, ['label', 'description', 'isCorrect'], itemProperties)
  }

  return keys
}

function panelTitleForArrayRow(
  arrayKey: string,
  index: number,
  groupTitle: string,
  _parentArrayKey?: string,
): string {
  if (arrayKey === 'suspects') {
    return `Suspect ${index + 1}`
  }
  if (arrayKey === 'supportingQuestions') {
    return `Question ${index + 1}`
  }
  if (arrayKey === 'options') {
    return `Option ${index + 1}`
  }
  return `${groupTitle} ${index + 1}`
}

function itemTemplateFromProperties(properties: Record<string, JsonSchemaProperty>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [itemKey, prop] of Object.entries(properties)) {
    const t = getSchemaType(prop)
    if (t === 'boolean') {
      row[itemKey] = false
    } else if (t === 'number') {
      row[itemKey] = ''
    } else if (t === 'array') {
      row[itemKey] = []
    } else {
      row[itemKey] = ''
    }
  }
  return row
}

export type BuildFormFieldsOptions = {
  /** Catalog slug (e.g. decision-point) for builder-specific field rules. */
  componentSlug?: string
}

/**
 * Emit scalar fields for one payload array-of-objects (and recurse into nested array-of-objects, e.g. solve-the-case question options).
 */
function emitPayloadArrayObjectFields(
  out: FormField[],
  draft: Record<string, unknown>,
  arrayKey: string,
  arrayProperty: JsonSchemaProperty,
  arrayPath: string[],
  section: FormSection,
  options: BuildFormFieldsOptions,
  payloadTopRequired: string[],
  parentArrayKey?: string,
): void {
  const items = arrayProperty.items
  if (!items || getSchemaType(items) !== 'object' || !items.properties) {
    return
  }

  const itemProps = items.properties
  const itemRequired = Array.isArray(items.required) ? items.required : []
  const raw = getValueAtPath(draft, arrayPath)
  const arr = Array.isArray(raw) ? raw : []

  let minItems = typeof arrayProperty.minItems === 'number' ? arrayProperty.minItems : 0
  if (
    isSolveTheCaseFamilySlug(options.componentSlug)
    && arrayKey === 'options'
    && parentArrayKey === 'supportingQuestions'
    && minItems < 1
  ) {
    minItems = 1
  }

  const fallbackWhenRequired = payloadTopRequired.includes(arrayKey) ? 1 : 0
  const maxItems = typeof arrayProperty.maxItems === 'number' ? arrayProperty.maxItems : DEFAULT_ARRAY_CAP
  const rowCount = Math.min(
    maxItems,
    Math.max(arr.length, minItems, fallbackWhenRequired),
  )

  const groupTitle = arrayProperty.title || humanizeKey(arrayKey)
  const itemPropKeyOrder = orderedArrayItemPropertyKeys(arrayKey, options.componentSlug, itemProps, parentArrayKey)

  for (let i = 0; i < rowCount; i++) {
    const panelId = [...arrayPath, String(i)].join('.')
    const panelTitle = panelTitleForArrayRow(arrayKey, i, groupTitle, parentArrayKey)

    for (const itemKey of itemPropKeyOrder) {
      const itemProp = itemProps[itemKey]
      if (!itemProp) {
        continue
      }

      if (
        options.componentSlug === 'decision-point'
        && arrayKey === 'options'
        && !parentArrayKey
        && itemKey === 'nextStepType'
      ) {
        continue
      }

      const itemType = getSchemaType(itemProp)

      if (itemType === 'array' && itemProp.items) {
        const nestedItems = itemProp.items
        if (getSchemaType(nestedItems) === 'object' && nestedItems.properties) {
          emitPayloadArrayObjectFields(
            out,
            draft,
            itemKey,
            itemProp,
            [...arrayPath, String(i), itemKey],
            section,
            options,
            payloadTopRequired,
            arrayKey,
          )
        }
        continue
      }

      if (
        itemType !== 'string'
        && itemType !== 'number'
        && itemType !== 'boolean'
        && !Array.isArray(itemProp.enum)
      ) {
        continue
      }

      const nextPath = [...arrayPath, String(i), itemKey]
      const fieldLabel = itemProp.title || humanizeKey(itemKey)

      const slug = options.componentSlug || ''
      const useSchemeCorrectRadio =
        itemKey === 'isCorrect'
        && itemType === 'boolean'
        && (
          ((slug === 'fraud-scheme-family' || slug === 'fraud-scheme') && arrayKey === 'schemes' && !parentArrayKey)
          || (isSolveTheCaseFamilySlug(slug) && arrayKey === 'suspects' && !parentArrayKey)
          || (isSolveTheCaseFamilySlug(slug) && arrayKey === 'options' && parentArrayKey === 'supportingQuestions')
        )

      const fieldRequired = itemRequired.includes(itemKey)

      out.push({
        id: nextPath.join('.'),
        label: fieldLabel,
        description: itemProp.description,
        path: nextPath,
        required: fieldRequired,
        section,
        schema: itemProp,
        multiline: itemType === 'string' && MULTILINE_FIELD_PATTERN.test(itemKey),
        disabled: MEDIA_REFERENCE_KEYS.has(itemKey),
        itemPanel: { id: panelId, title: panelTitle, order: i },
        ...(useSchemeCorrectRadio ? { customType: 'scheme-correct-radio' as const } : {}),
      })
    }
  }
}

/**
 * Emit one scalar form field per property of each object in an array-of-objects payload (e.g. options[], schemes[], suspects[]).
 */
function appendArrayObjectScalarFields(
  out: FormField[],
  draft: Record<string, unknown>,
  schema: JsonSchemaProperty | undefined,
  section: FormSection,
  basePath: string[],
  options: BuildFormFieldsOptions,
) {
  const properties = schema?.properties
  if (!properties || typeof properties !== 'object') {
    return
  }

  const topRequired = Array.isArray(schema.required) ? schema.required : []

  for (const [key, property] of Object.entries(properties)) {
    if (getSchemaType(property) !== 'array' || !property.items) {
      continue
    }

    const items = property.items
    if (getSchemaType(items) !== 'object' || !items.properties) {
      continue
    }

    emitPayloadArrayObjectFields(out, draft, key, property, [...basePath, key], section, options, topRequired, undefined)
  }
}

export function buildFormFieldsFromCompiledContract(
  compiledContract: Record<string, unknown> | null | undefined,
  draft?: Record<string, unknown> | null,
  options: BuildFormFieldsOptions = {},
): FormField[] {
  if (!compiledContract || typeof compiledContract !== 'object') {
    return []
  }

  const fields: FormField[] = []
  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty }, config?: { schema?: JsonSchemaProperty } }
  collectSchemaFields(fields, contract.payload?.schema, 'payload', ['payload'])
  collectSchemaFields(fields, contract.config?.schema, 'config', ['config'])

  const normalizedDraft = draft ? normalizePropsDraft(draft) : normalizePropsDraft({})
  appendArrayObjectScalarFields(fields, normalizedDraft, contract.payload?.schema, 'payload', ['payload'], options)

  return fields
}

export function buildFormFieldsFromDetail(
  detail: ComponentsCatalogDetailPayload | null | undefined,
  draft?: Record<string, unknown> | null,
): FormField[] {
  return buildFormFieldsFromCompiledContract(detail?.compiledContract ?? null, draft ?? null, {
    componentSlug: detail?.slug,
  })
}

export type PayloadArrayDescriptor = {
  arrayPath: string[]
  label: string
  minItems: number
  itemTemplate: Record<string, unknown>
}

/**
 * Payload keys that are arrays of objects (for add/remove row controls in the builder).
 */
export function listPayloadArrayDescriptors(
  compiledContract: Record<string, unknown> | null | undefined,
): PayloadArrayDescriptor[] {
  if (!compiledContract || typeof compiledContract !== 'object') {
    return []
  }

  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty } }
  const schema = contract.payload?.schema
  const properties = schema?.properties
  if (!properties) {
    return []
  }

  const topRequired = Array.isArray(schema.required) ? schema.required : []
  const out: PayloadArrayDescriptor[] = []

  for (const [key, property] of Object.entries(properties)) {
    if (getSchemaType(property) !== 'array' || !property.items) {
      continue
    }
    const items = property.items
    if (getSchemaType(items) !== 'object' || !items.properties) {
      continue
    }

    const minItems = typeof property.minItems === 'number'
      ? property.minItems
      : (topRequired.includes(key) ? 1 : 0)

    out.push({
      arrayPath: ['payload', key],
      label: property.title || humanizeKey(key),
      minItems,
      itemTemplate: itemTemplateFromProperties(items.properties),
    })
  }

  return out
}

function fillMissingSequentialRowIds(
  rows: unknown,
  idPattern: RegExp,
  prefix: string,
): void {
  if (!Array.isArray(rows)) {
    return
  }
  let maxNum = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const id = (row as Record<string, unknown>).id
    if (typeof id === 'string') {
      const m = idPattern.exec(id.trim())
      const n = m?.[1]
      if (n !== undefined) {
        maxNum = Math.max(maxNum, Number.parseInt(n, 10))
      }
    }
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const r = row as Record<string, unknown>
    const id = r.id
    if (typeof id === 'string' && id.trim() !== '') {
      continue
    }
    maxNum += 1
    r.id = `${prefix}${maxNum}`
  }
}

/** Fraud scheme rows: hidden `id` in the form; keep stable `scheme-*` ids. */
function ensureFraudSchemesHaveIds(draft: Record<string, unknown>): void {
  fillMissingSequentialRowIds(getValueAtPath(draft, ['payload', 'schemes']), /^scheme-(\d+)$/, 'scheme-')
}

/** Solve-the-case: suspects, supporting questions, and per-question options. */
function ensureSolveTheCaseFamilyIds(draft: Record<string, unknown>): void {
  fillMissingSequentialRowIds(getValueAtPath(draft, ['payload', 'suspects']), /^suspect-(\d+)$/, 'suspect-')
  const questions = getValueAtPath(draft, ['payload', 'supportingQuestions'])
  if (!Array.isArray(questions)) {
    return
  }
  fillMissingSequentialRowIds(questions, /^question-(\d+)$/, 'question-')
  for (const q of questions) {
    if (!q || typeof q !== 'object') {
      continue
    }
    const opts = (q as Record<string, unknown>).options
    fillMissingSequentialRowIds(opts, /^option-(\d+)$/, 'option-')
  }
}

export function appendPayloadArrayItem(
  draft: Record<string, unknown>,
  arrayPath: string[],
  itemTemplate: Record<string, unknown>,
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)
  const raw = getValueAtPath(next, arrayPath)
  const arr = Array.isArray(raw) ? [...raw] : []
  arr.push({ ...itemTemplate })
  setValueAtPath(next, arrayPath, arr)
  if (arrayPath[0] === 'payload') {
    ensureFraudSchemesHaveIds(next)
    ensureSolveTheCaseFamilyIds(next)
  }
  return next
}

export function removePayloadArrayItemAt(
  draft: Record<string, unknown>,
  arrayPath: string[],
  index: number,
  minItems: number,
): Record<string, unknown> | null {
  const next = normalizePropsDraft(draft)
  const raw = getValueAtPath(next, arrayPath)
  if (!Array.isArray(raw) || raw.length <= minItems || index < 0 || index >= raw.length) {
    return null
  }
  const arr = raw.filter((_, i) => i !== index)
  setValueAtPath(next, arrayPath, arr)
  return next
}

/**
 * Ensure array-of-object payload keys meet contract min length (e.g. decision-point options minItems: 2).
 */
export function padPayloadArraysFromContract(
  draft: Record<string, unknown>,
  compiledContract: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)
  const descriptors = listPayloadArrayDescriptors(compiledContract)
  for (const { arrayPath, minItems, itemTemplate } of descriptors) {
    if (minItems <= 0) {
      continue
    }
    const raw = getValueAtPath(next, arrayPath)
    const arr = Array.isArray(raw) ? [...raw] : []
    while (arr.length < minItems) {
      arr.push({ ...itemTemplate })
    }
    setValueAtPath(next, arrayPath, arr)
  }
  ensureFraudSchemesHaveIds(next)
  ensureSolveTheCaseFamilyIds(next)
  return next
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isArrayIndexSegment(segment: string): boolean {
  return /^\d+$/.test(String(segment))
}

export function getValueAtPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined
    }
    if (Array.isArray(current)) {
      const idx = Number.parseInt(String(segment), 10)
      return Number.isNaN(idx) ? undefined : current[idx]
    }
    if (!isRecord(current)) {
      return undefined
    }

    return current[segment]
  }, source)
}

export function setValueAtPath(source: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) {
    return source
  }

  const walk = (parent: unknown, depth: number): void => {
    const segment = path[depth]!
    const isLeaf = depth === path.length - 1
    const nextSeg = path[depth + 1]
    const childShouldBeArray = nextSeg !== undefined && isArrayIndexSegment(String(nextSeg))

    if (Array.isArray(parent)) {
      const idx = Number.parseInt(String(segment), 10)
      if (Number.isNaN(idx)) {
        return
      }
      const arr = parent as unknown[]
      while (arr.length <= idx) {
        const fillNext = path[depth + 1]
        const slotIsIndex = fillNext !== undefined && isArrayIndexSegment(String(fillNext))
        arr.push(slotIsIndex ? [] : {})
      }
      if (isLeaf) {
        arr[idx] = value
        return
      }
      let child = arr[idx]
      if (child === null || child === undefined) {
        child = childShouldBeArray ? [] : {}
        arr[idx] = child
      } else if (childShouldBeArray && !Array.isArray(child)) {
        child = []
        arr[idx] = child
      } else if (!childShouldBeArray && Array.isArray(child)) {
        child = {}
        arr[idx] = child
      }
      walk(child, depth + 1)
      return
    }

    if (!isRecord(parent)) {
      return
    }

    if (isLeaf) {
      parent[segment] = value
      return
    }

    let child = parent[segment]
    if (child === null || child === undefined) {
      child = childShouldBeArray ? [] : {}
      parent[segment] = child
    } else if (childShouldBeArray && !Array.isArray(child)) {
      child = []
      parent[segment] = child
    } else if (!childShouldBeArray && Array.isArray(child)) {
      child = {}
      parent[segment] = child
    }

    walk(child, depth + 1)
  }

  walk(source, 0)
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

/** Path to the object array whose rows expose `isCorrect` (e.g. `payload.schemes` or `payload.suspects`). */
export function exclusiveCorrectArrayPathForField(field: FormField): string[] | null {
  if (field.customType !== 'scheme-correct-radio') {
    return null
  }
  const path = field.path
  if (path.length < 2 || path[path.length - 1] !== 'isCorrect') {
    return null
  }
  return path.slice(0, -2)
}

/** First row index with `isCorrect: true` in that array, or -1. */
export function selectedExclusiveCorrectRowIndex(
  draft: Record<string, unknown>,
  arrayPath: string[],
): number {
  const rows = getValueAtPath(draft, arrayPath)
  if (!Array.isArray(rows)) {
    return -1
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row && typeof row === 'object' && Boolean((row as Record<string, unknown>).isCorrect)) {
      return i
    }
  }
  return -1
}

export function isExclusiveCorrectRadioChecked(draft: Record<string, unknown>, field: FormField): boolean {
  const arrayPath = exclusiveCorrectArrayPathForField(field)
  if (!arrayPath) {
    return false
  }
  const idx = Number.parseInt(String(field.path[field.path.length - 2]), 10)
  if (Number.isNaN(idx)) {
    return false
  }
  return selectedExclusiveCorrectRowIndex(draft, arrayPath) === idx
}

/** @deprecated Use selectedExclusiveCorrectRowIndex(draft, ['payload','schemes']). */
export function selectedPayloadSchemesCorrectIndex(draft: Record<string, unknown>): number {
  return selectedExclusiveCorrectRowIndex(draft, ['payload', 'schemes'])
}

/** @deprecated Use isExclusiveCorrectRadioChecked. */
export function isPayloadSchemeCorrectRowActive(
  draft: Record<string, unknown>,
  schemeIndex: number,
): boolean {
  return selectedExclusiveCorrectRowIndex(draft, ['payload', 'schemes']) === schemeIndex
}

export function applyFieldUpdateToDraft(
  draft: Record<string, unknown>,
  field: FormField,
  value: unknown,
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)

  if (field.customType === 'scheme-correct-radio') {
    const path = field.path
    if (value && path.length >= 2 && path[path.length - 1] === 'isCorrect') {
      const rowIdx = Number.parseInt(String(path[path.length - 2]), 10)
      const arrayPath = path.slice(0, -2)
      if (!Number.isNaN(rowIdx) && arrayPath[0] === 'payload') {
        const rows = getValueAtPath(next, arrayPath)
        if (Array.isArray(rows)) {
          const updated = rows.map((row, i) => {
            if (!row || typeof row !== 'object') {
              return row
            }
            return { ...(row as Record<string, unknown>), isCorrect: i === rowIdx }
          })
          setValueAtPath(next, arrayPath, updated)
        }
      }
    }
    return next
  }

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
