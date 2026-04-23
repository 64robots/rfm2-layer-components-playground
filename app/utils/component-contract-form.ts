import type { ComponentsCatalogDetailPayload } from '../types/components-playground'

/** Client-only stable identity for `payload.attachments[]` rows (vuedraggable keys; omitted from API). */
export const PAYLOAD_ATTACHMENT_UI_ROW_KEY = '_uiRowKey'

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
  default?: unknown
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
  /** Editable but not writable (e.g. derived page count); avoids “managed source” disabled styling. */
  readOnly?: boolean
  customType?: 'media-asset' | 'scheme-correct-radio' | 'media-url' | 'string-array-lines' | 'investigation-linked-file-select'
  /**
   * When `customType` is `media-url`, limits the media library and file picker.
   * `any` = images, videos, documents; `image` = images only (e.g. suspect headshots);
   * `video` = videos only (e.g. video activity main asset).
   */
  mediaUrlMode?: 'any' | 'image' | 'video'
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

/** Solve-the-case lesson editor: intro then suspects arrays, then justification / evidence heading / verdict title, then remaining scalars. */
const SOLVE_CASE_PAYLOAD_CHUNK_BEFORE_ARRAYS: readonly string[] = [
  'payload.title',
  'payload.intro',
]

const SOLVE_CASE_PAYLOAD_CHUNK_AFTER_ARRAYS_HEAD: readonly string[] = [
  'payload.justificationLabel',
  'payload.justificationPlaceholder',
  'payload.evidenceTitle',
  'payload.evidenceHighlights',
]

const SOLVE_CASE_PAYLOAD_REST_FIELD_RANK: Record<string, number> = {
  'payload.supportingSectionTitle': 0,
  'payload.supportingSectionIntro': 1,
  'payload.requireJustification': 2,
  'payload.verdictTitle': 3,
}

function rankSolveCaseRestStandaloneField(id: string): number {
  return Object.prototype.hasOwnProperty.call(SOLVE_CASE_PAYLOAD_REST_FIELD_RANK, id)
    ? SOLVE_CASE_PAYLOAD_REST_FIELD_RANK[id]!
    : 1000
}

/** Fraud scheme family lesson editor: prompt before schemes arrays, then remaining scalars after. */
const FRAUD_SCHEME_PAYLOAD_CHUNK_BEFORE_ARRAYS: readonly string[] = [
  'payload.prompt',
]

/**
 * Split payload standalone fields for the lesson activity editor so top-level object arrays (suspects, etc.)
 * can be rendered between intro copy and later scalars.
 */
export function standalonePayloadFieldChunksForLessonEditor(
  payloadStandaloneFields: FormField[],
  componentSlug: string | undefined,
): FormField[][] {
  if (isFraudSchemeFamilySlug(componentSlug)) {
    const before = FRAUD_SCHEME_PAYLOAD_CHUNK_BEFORE_ARRAYS
      .map(id => payloadStandaloneFields.find(f => f.id === id))
      .filter((f): f is FormField => Boolean(f))
    const used = new Set(before.map(f => f.id))
    const rest = payloadStandaloneFields.filter(f => !used.has(f.id))
    // Two slots: prompt before schemes array, then remaining fields after.
    return [before, [], rest]
  }

  if (!isSolveTheCaseFamilySlug(componentSlug)) {
    return [payloadStandaloneFields]
  }
  const before = SOLVE_CASE_PAYLOAD_CHUNK_BEFORE_ARRAYS
    .map(id => payloadStandaloneFields.find(f => f.id === id))
    .filter((f): f is FormField => Boolean(f))
  const used = new Set(before.map(f => f.id))
  const afterHead = SOLVE_CASE_PAYLOAD_CHUNK_AFTER_ARRAYS_HEAD
    .map(id => payloadStandaloneFields.find(f => f.id === id))
    .filter((f): f is FormField => Boolean(f))
  afterHead.forEach(f => used.add(f.id))
  const rest = payloadStandaloneFields
    .filter(f => !used.has(f.id))
    .sort(
      (a, b) =>
        rankSolveCaseRestStandaloneField(a.id) - rankSolveCaseRestStandaloneField(b.id)
        || a.id.localeCompare(b.id),
    )
  // Always three slots so arrays render after the intro chunk even when `before` is empty.
  return [before, afterHead, rest]
}

export function fieldValueAsMultilineString(draft: Record<string, unknown>, field: FormField): string {
  if (field.customType === 'string-array-lines') {
    const v = getValueAtPath(draft, field.path)
    if (!Array.isArray(v)) {
      return ''
    }
    return v.filter((x): x is string => typeof x === 'string').join('\n')
  }
  const v = getValueAtPath(draft, field.path)
  return String(v ?? '')
}

export const MEDIA_REFERENCE_KEYS = new Set(['src', 'url', 'imageUrl', 'thumbnailUrl', 'mediaUuid'])
export const MULTILINE_FIELD_PATTERN
  = /(body|instructions|intro|description|note|text|content|transcript|summary|helperText)/i

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

/** Investigation desktop + accessible variants share the same payload shape. */
export function isInvestigationActivitySlug(slug: string | undefined): boolean {
  return slug === 'investigation' || slug === 'accessible-investigation'
}

/**
 * Ensure every `payload.files[]` row in an investigation draft has a non-empty
 * string `id`. Heals rows that predate the auto-id wiring (or were imported
 * without ids) so dropdowns referring to `payload.files[].id` (e.g. questions'
 * `linkedFileId`) have stable targets. Mutates `draft` in place and returns
 * `true` if any row was modified.
 */
export function ensureInvestigationFileIds(draft: Record<string, unknown>): boolean {
  const files = getValueAtPath(draft, ['payload', 'files'])
  if (!Array.isArray(files)) {
    return false
  }
  let mutated = false
  for (const row of files) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const r = row as Record<string, unknown>
    const current = typeof r.id === 'string' ? r.id.trim() : ''
    if (current) {
      continue
    }
    r.id = `files-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    mutated = true
  }
  return mutated
}

/**
 * Auto-grid layout for investigation files without an explicit position.
 * Mirrors `InvestigationDesktop.vue`'s `autoGridPosition` (3-column grid,
 * ~70% width spread, 28% row height) so the seeded default places files in
 * the same visual slot the renderer would pick at runtime.
 */
function investigationFileDefaultPosition(
  index: number,
  total: number,
): { x: number, y: number, rotation: number } {
  const cols = Math.max(1, Math.min(total || 1, 3))
  const row = Math.floor(index / cols)
  const col = index % cols
  const cellWidth = 70 / cols
  // Deterministic jitter so the "messy desk" look is stable across renders but
  // varies per slot (index drives the rotation seed).
  const rotationSeed = Math.sin(index * 12.9898) * 43758.5453
  const rotation = Math.round(((rotationSeed - Math.floor(rotationSeed)) * 8 - 4) * 10) / 10
  return {
    x: Math.round((4 + col * cellWidth) * 10) / 10,
    y: Math.round((4 + row * 28) * 10) / 10,
    rotation,
  }
}

/**
 * Ensure every `payload.files[]` row has a `position` object
 * (`{ x, y, rotation }`). Without this, new files render at the auto-grid
 * default on every open but never get those coordinates persisted to the
 * payload — which means author-level drags in the live preview (and manual
 * edits) reset whenever the activity is reloaded. Seeds defaults that match
 * the renderer's auto-grid so the visual layout doesn't shift when the
 * position becomes explicit. Mutates in place, returns `true` if any row
 * was modified.
 */
export function ensureInvestigationFilePositions(draft: Record<string, unknown>): boolean {
  const files = getValueAtPath(draft, ['payload', 'files'])
  if (!Array.isArray(files)) {
    return false
  }
  let mutated = false
  for (let i = 0; i < files.length; i++) {
    const row = files[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const r = row as Record<string, unknown>
    const existing = r.position
    if (isRecord(existing)) {
      const ex = existing as Record<string, unknown>
      // Fill any missing axis so partial position rows become renderable.
      let touched = false
      const defaults = investigationFileDefaultPosition(i, files.length)
      if (typeof ex.x !== 'number' || !Number.isFinite(ex.x)) {
        ex.x = defaults.x
        touched = true
      }
      if (typeof ex.y !== 'number' || !Number.isFinite(ex.y)) {
        ex.y = defaults.y
        touched = true
      }
      if (typeof ex.rotation !== 'number' || !Number.isFinite(ex.rotation)) {
        ex.rotation = defaults.rotation
        touched = true
      }
      if (touched) {
        mutated = true
      }
      continue
    }
    r.position = investigationFileDefaultPosition(i, files.length)
    mutated = true
  }
  return mutated
}

/**
 * Investigation question → file link options.
 * Reads `payload.files[]` from the current draft and returns `{ value, label }`
 * entries suitable for a `<USelect>` that populates `question.linkedFileId`.
 * Older drafts without `id` values are kept off the list because we can't
 * safely save a linked reference — `ensureInvestigationFileIds` (called on
 * pad, append, and via a watcher in the activity editor) heals those rows so
 * they appear as soon as the payload next cycles through. Missing titles fall
 * back to a positional "File N" label so authors can still distinguish rows.
 */
export function investigationLinkedFileOptions(
  draft: Record<string, unknown>,
): { value: string, label: string }[] {
  const files = getValueAtPath(draft, ['payload', 'files'])
  if (!Array.isArray(files)) {
    return []
  }
  const out: { value: string, label: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const row = files[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) {
      continue
    }
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    out.push({ value: id, label: title || `File ${i + 1}` })
  }
  return out
}

/** Fraud triangle catalog slug (`payload.documents[]` + title / description). */
export function isFraudTriangleSlug(slug: string | undefined): boolean {
  return slug === 'fraud-triangle'
}

/** Video activity (`payload.video`, `payload.poster`, `payload.attachments[].file`). */
export function isVideoActivitySlug(slug: string | undefined): boolean {
  return slug === 'video'
}

/** Synopsis catalog slug (`payload.intro` + `sections[]`). */
export function isSynopsisSlug(slug: string | undefined): boolean {
  return slug === 'synopsis'
}

/** Fraud scheme family catalog slugs. */
export function isFraudSchemeFamilySlug(slug: string | undefined): boolean {
  if (!slug) {
    return false
  }
  return (
    slug === 'fraud-scheme-family'
    || slug === 'fraud-scheme'
    || slug === 'fraud-scheme-two-attempts'
    || slug === 'fraud-scheme-review'
  )
}

/** Quiz family catalog slugs (unified `questions[].kind` + `options`). */
export function isQuizFamilySlug(slug: string | undefined): boolean {
  if (!slug) {
    return false
  }
  return (
    slug === 'quiz-family'
    || slug === 'quiz'
    || slug.startsWith('quiz-questions')
    || slug === 'final-exam'
    || slug === 'review-quiz'
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

function dereferenceSchemaProperty(
  prop: JsonSchemaProperty | undefined,
  rootWithDefs: JsonSchemaProperty,
): JsonSchemaProperty | undefined {
  if (!prop) {
    return undefined
  }
  const ref = prop.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return prop
  }
  const pointer = ref.slice(1).split('/').filter(Boolean)
  let cur: unknown = rootWithDefs
  for (const key of pointer) {
    if (!cur || typeof cur !== 'object') {
      return undefined
    }
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur as JsonSchemaProperty | undefined
}

function schemaLooksLikeArray(s: JsonSchemaProperty | undefined): boolean {
  return Boolean(s && (getSchemaType(s) === 'array' || s.items))
}

function schemaLooksLikeObject(s: JsonSchemaProperty | undefined): boolean {
  return Boolean(s && (getSchemaType(s) === 'object' || s.properties))
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

  const keysInOrder = orderedObjectPropertyKeys(Object.keys(properties), properties, path)
  for (const key of keysInOrder) {
    const property = properties[key]
    if (!property) {
      continue
    }
    const nextPath = [...path, key]
    const baseType = getSchemaType(property)

    if (baseType === 'object' && property.properties && nextPath.length <= 3) {
      collectSchemaFields(out, property, section, nextPath, Array.isArray(property.required) ? property.required : [])
      continue
    }

    if (baseType === 'array') {
      const itemsProp = property.items as JsonSchemaProperty | undefined
      const itemType = itemsProp ? getSchemaType(itemsProp) : null
      if (
        itemType === 'string'
        && itemsProp
        && !schemaLooksLikeObject(itemsProp)
        && !Array.isArray(itemsProp.enum)
      ) {
        out.push({
          id: nextPath.join('.'),
          label: property.title || humanizeKey(key),
          description: property.description,
          path: nextPath,
          required: required.includes(key),
          section,
          schema: property,
          multiline: true,
          disabled: false,
          customType: 'string-array-lines',
        })
        continue
      }
      // Array-of-object lists are expanded separately from the live draft (see appendArrayObjectScalarFields).
      continue
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
  }
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

/**
 * Order for scalar/object property keys in contract forms: headings first, then body copy, then everything else (schema order).
 * Matches author expectation (e.g. decision-point heading before prompt, option label before supporting text).
 */
const CANONICAL_FORM_FIELD_KEY_ORDER: readonly string[] = [
  'title',
  'headline',
  'eyebrow',
  'label',
  'name',
  'body',
  'description',
  'prompt',
  'schemes',
  'summary',
  'instructions',
  'text',
  'helperText',
  'content',
  'note',
  'transcript',
]

/**
 * When walking `payload` / `config` schema `properties`, skip `id` at the root only (values are generated; not author-editable).
 */
function shouldOmitIdPropertyKey(pathPrefix: string[], key: string): boolean {
  return (
    key === 'id'
    && pathPrefix.length === 1
    && (pathPrefix[0] === 'payload' || pathPrefix[0] === 'config')
  )
}

function orderedObjectPropertyKeys(
  keys: string[],
  properties: Record<string, JsonSchemaProperty>,
  pathPrefix: string[],
): string[] {
  const filtered = keys.filter((k) => !shouldOmitIdPropertyKey(pathPrefix, k))
  return orderKeysWithPreferredHead(filtered, CANONICAL_FORM_FIELD_KEY_ORDER, properties)
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

  const isFraudTriangleDocuments = slug === 'fraud-triangle' && arrayKey === 'documents' && !parentArrayKey
  if (isFraudTriangleDocuments) {
    keys = keys.filter(k => k !== 'id' && k !== 'mimeType')
    return orderKeysWithPreferredHead(
      keys,
      ['title', 'url', 'alt', 'pageCount', 'openLabel', 'pdfDisplayMode', 'pageTabs'],
      itemProperties,
    )
  }

  if (isVideoActivitySlug(slug) && arrayKey === 'attachments' && !parentArrayKey) {
    keys = keys.filter((k) => k !== 'id')
    return orderKeysWithPreferredHead(keys, ['label', 'file'], itemProperties)
  }

  keys = keys.filter((k) => k !== 'id')
  return orderKeysWithPreferredHead(keys, CANONICAL_FORM_FIELD_KEY_ORDER, itemProperties)
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
  if (arrayKey === 'documents') {
    return `Document ${index + 1}`
  }
  if (arrayKey === 'attachments') {
    return `Attachment ${index + 1}`
  }
  return `${groupTitle} ${index + 1}`
}

function itemTemplateFromProperties(properties: Record<string, JsonSchemaProperty>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [itemKey, prop] of Object.entries(properties)) {
    const t = getSchemaType(prop)
    // Honor schema-level defaults first so contracts can opt into non-zero
    // initial values (e.g. `viewableAtOnset: true` for investigation files).
    if (t === 'boolean' && typeof prop.default === 'boolean') {
      row[itemKey] = prop.default
    } else if (t === 'number' && typeof prop.default === 'number') {
      row[itemKey] = prop.default
    } else if (t === 'array' && Array.isArray(prop.default)) {
      row[itemKey] = [...prop.default]
    } else if (t === 'string' && typeof prop.default === 'string') {
      row[itemKey] = prop.default
    } else if (t === 'boolean') {
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
 * After the learner picks image vs video, expose external URL + alt (matches saved `payload.media.file` shape).
 */
function appendContentCardMediaExternalFileFields(
  out: FormField[],
  draft: Record<string, unknown>,
  options: BuildFormFieldsOptions,
): void {
  const slug = options.componentSlug || ''
  if (slug !== 'content-card' && slug !== 'intro-card') {
    return
  }
  const kind = getValueAtPath(draft, ['payload', 'media', 'kind'])
  if (kind !== 'image' && kind !== 'video') {
    return
  }
  if (out.some(f => f.id === 'payload.media.file.url')) {
    return
  }

  const urlField: FormField = {
    id: 'payload.media.file.url',
    label: 'Media URL',
    description: 'External image or video URL for this card.',
    path: ['payload', 'media', 'file', 'url'],
    required: false,
    section: 'payload',
    schema: { type: 'string', title: 'Media URL' },
    multiline: false,
    disabled: false,
    customType: 'media-url',
    mediaUrlMode: kind === 'video' ? 'any' : 'image',
  }
  const altField: FormField = {
    id: 'payload.media.file.alt',
    label: 'Alt text',
    description: 'Describe the media for accessibility.',
    path: ['payload', 'media', 'file', 'alt'],
    required: false,
    section: 'payload',
    schema: { type: 'string', title: 'Alt text' },
    multiline: false,
    disabled: false,
  }

  const kindIdx = out.findIndex(f => f.id === 'payload.media.kind')
  if (kindIdx >= 0) {
    out.splice(kindIdx + 1, 0, urlField, altField)
  } else {
    out.push(urlField, altField)
  }
}

/**
 * Video activity: `payload.video` / `payload.poster` are `oneOf` media assets in the contract JSON Schema,
 * so they are skipped by `collectSchemaFields`. Emit explicit media-url + scalar fields for the lesson editor.
 */
function appendVideoActivityMediaFields(
  out: FormField[],
  options: BuildFormFieldsOptions,
): void {
  if (!isVideoActivitySlug(options.componentSlug)) {
    return
  }
  if (out.some(f => f.id === 'payload.video.url')) {
    return
  }

  const videoUrl: FormField = {
    id: 'payload.video.url',
    label: 'Video',
    description: 'Main video: library, upload, or external URL.',
    path: ['payload', 'video', 'url'],
    required: true,
    section: 'payload',
    schema: { type: 'string', title: 'Video URL' },
    multiline: false,
    disabled: false,
    customType: 'media-url',
    mediaUrlMode: 'video',
  }
  const videoTitle: FormField = {
    id: 'payload.video.title',
    label: 'Video title',
    description: 'Optional display title for the video asset.',
    path: ['payload', 'video', 'title'],
    required: false,
    section: 'payload',
    schema: { type: 'string', title: 'Video title' },
    multiline: false,
    disabled: false,
  }
  const posterUrl: FormField = {
    id: 'payload.poster.url',
    label: 'Poster',
    description: 'Optional image shown before playback (library, upload, or URL).',
    path: ['payload', 'poster', 'url'],
    required: false,
    section: 'payload',
    schema: { type: 'string', title: 'Poster URL' },
    multiline: false,
    disabled: false,
    customType: 'media-url',
    mediaUrlMode: 'image',
  }
  const posterAlt: FormField = {
    id: 'payload.poster.alt',
    label: 'Poster alt text',
    description: 'Accessibility description for the poster image.',
    path: ['payload', 'poster', 'alt'],
    required: false,
    section: 'payload',
    schema: { type: 'string', title: 'Poster alt text' },
    multiline: false,
    disabled: false,
  }

  const descIdx = out.findIndex(f => f.id === 'payload.description')
  if (descIdx >= 0) {
    out.splice(descIdx + 1, 0, videoUrl, videoTitle, posterUrl, posterAlt)
  } else {
    out.push(videoUrl, videoTitle, posterUrl, posterAlt)
  }
}

/** Preferred Content Card / intro-card payload field order (API may serve schema keys alphabetically). */
const INTRO_CONTENT_CARD_PAYLOAD_FIELD_ORDER: readonly string[] = [
  'payload.title',
  'payload.body',
  'payload.buttonLabel',
  'payload.media.kind',
  'payload.media.file.url',
  'payload.media.file.alt',
]

function reorderIntroContentCardPayloadStandaloneFields(
  out: FormField[],
  options: BuildFormFieldsOptions,
): void {
  const slug = options.componentSlug || ''
  if (slug !== 'content-card' && slug !== 'intro-card') {
    return
  }

  const payloadStandalone: FormField[] = []
  const payloadPanel: FormField[] = []
  const rest: FormField[] = []

  for (const f of out) {
    if (f.section === 'payload' && !f.itemPanel) {
      payloadStandalone.push(f)
    } else if (f.section === 'payload' && f.itemPanel) {
      payloadPanel.push(f)
    } else {
      rest.push(f)
    }
  }

  const rank = (id: string): number => {
    const i = INTRO_CONTENT_CARD_PAYLOAD_FIELD_ORDER.indexOf(id)
    return i === -1 ? INTRO_CONTENT_CARD_PAYLOAD_FIELD_ORDER.length + 1 : i
  }

  payloadStandalone.sort(
    (a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id),
  )

  out.length = 0
  out.push(...payloadStandalone, ...payloadPanel, ...rest)
}

/** Title before body copy; `description` is labeled “Body” in the contract. */
const FRAUD_TRIANGLE_PAYLOAD_FIELD_ORDER: readonly string[] = [
  'payload.title',
  'payload.description',
]

/**
 * Legacy payload keys normalized into `documents[]` at runtime; hide duplicate editors in the builder.
 * Keeps `payload.title`, `payload.description`, `payload.documents`, `payload.pillars`, and `config`.
 */
const FRAUD_TRIANGLE_LEGACY_PAYLOAD_ROOT_KEYS = new Set([
  'scenario',
  'text',
  'body',
  'document',
  'pdf',
  'tabPdf',
  'images',
  'pdfs',
])

function omitLegacyFraudTrianglePayloadFormFields(
  fields: FormField[],
  options: BuildFormFieldsOptions,
): void {
  if (!isFraudTriangleSlug(options.componentSlug)) {
    return
  }
  const next = fields.filter((f) => {
    if (f.section !== 'payload') {
      return true
    }
    const p = f.path
    if (p.length < 2 || p[0] !== 'payload') {
      return true
    }
    const rootKey = p[1]!
    if (p.length === 2 && FRAUD_TRIANGLE_LEGACY_PAYLOAD_ROOT_KEYS.has(rootKey)) {
      return false
    }
    if (p.length >= 3 && FRAUD_TRIANGLE_LEGACY_PAYLOAD_ROOT_KEYS.has(rootKey)) {
      return false
    }
    return true
  })
  fields.length = 0
  fields.push(...next)
}

function reorderFraudTrianglePayloadStandaloneFields(
  out: FormField[],
  options: BuildFormFieldsOptions,
): void {
  if (!isFraudTriangleSlug(options.componentSlug)) {
    return
  }

  const payloadStandalone: FormField[] = []
  const payloadPanel: FormField[] = []
  const rest: FormField[] = []

  for (const f of out) {
    if (f.section === 'payload' && !f.itemPanel) {
      payloadStandalone.push(f)
    } else if (f.section === 'payload' && f.itemPanel) {
      payloadPanel.push(f)
    } else {
      rest.push(f)
    }
  }

  const rank = (id: string): number => {
    const i = FRAUD_TRIANGLE_PAYLOAD_FIELD_ORDER.indexOf(id)
    return i === -1 ? FRAUD_TRIANGLE_PAYLOAD_FIELD_ORDER.length + 1 : i
  }

  payloadStandalone.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))

  out.length = 0
  out.push(...payloadStandalone, ...payloadPanel, ...rest)
}

function reorderFraudSchemePayloadStandaloneFields(
  out: FormField[],
  options: BuildFormFieldsOptions,
): void {
  if (!isFraudSchemeFamilySlug(options.componentSlug)) {
    return
  }

  const payloadPromptIdx = out.findIndex(f => f.id === 'payload.prompt')
  const payloadSchemesPattern = /^payload\.schemes\.\d+/
  const schemesFieldIndices = out
    .map((f, i) => (payloadSchemesPattern.test(f.id) ? i : -1))
    .filter(i => i !== -1)

  if (payloadPromptIdx === -1 || schemesFieldIndices.length === 0) {
    return
  }

  // Extract schemes fields in reverse order to keep indices stable while splicing
  const schemesFields: FormField[] = []
  for (let i = schemesFieldIndices.length - 1; i >= 0; i--) {
    schemesFields.unshift(out.splice(schemesFieldIndices[i]!, 1)[0]!)
  }

  const newPromptIdx = out.findIndex(f => f.id === 'payload.prompt')
  out.splice(newPromptIdx + 1, 0, ...schemesFields)
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
  parentArrayKey: string | undefined,
  rootPayloadSchema: JsonSchemaProperty | undefined,
): void {
  const root = rootPayloadSchema || {}
  const itemsResolved = dereferenceSchemaProperty(
    arrayProperty.items as JsonSchemaProperty,
    root,
  )
  if (!itemsResolved || !schemaLooksLikeObject(itemsResolved) || !itemsResolved.properties) {
    return
  }

  if (
    isQuizFamilySlug(options.componentSlug)
    && arrayKey === 'options'
    && parentArrayKey === 'questions'
    && arrayPath.length >= 4
  ) {
    const qIdx = arrayPath[arrayPath.length - 2]!
    const kind = getValueAtPath(draft, ['payload', 'questions', qIdx, 'kind'])
    if (kind === 'text') {
      return
    }
  }

  const itemProps = itemsResolved.properties
  const itemRequired = Array.isArray(itemsResolved.required) ? itemsResolved.required : []
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
      const rawItemProp = itemProps[itemKey]
      const itemProp = dereferenceSchemaProperty(rawItemProp, root)
      if (!itemProp) {
        continue
      }

      /** Builder: ids are auto-generated; do not show an editor field. */
      if (itemKey === 'id') {
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

      if (schemaLooksLikeArray(itemProp) && itemProp.items) {
        const nestedItems = dereferenceSchemaProperty(itemProp.items as JsonSchemaProperty, root)
        if (nestedItems && schemaLooksLikeObject(nestedItems) && nestedItems.properties) {
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
            rootPayloadSchema,
          )
        }
        continue
      }

      const isVideoAttachmentFile
        = isVideoActivitySlug(options.componentSlug)
          && arrayKey === 'attachments'
          && !parentArrayKey
          && itemKey === 'file'
          && !itemType
          && (Boolean(itemProp.oneOf) || Boolean(itemProp.$ref))

      if (isVideoAttachmentFile) {
        const fileUrlPath = [...arrayPath, String(i), 'file', 'url']
        out.push({
          id: fileUrlPath.join('.'),
          label: 'File',
          description: 'PDF or document: library, upload, or external URL.',
          path: fileUrlPath,
          required: itemRequired.includes('file'),
          section,
          schema: { type: 'string', title: 'File URL' },
          multiline: false,
          disabled: false,
          customType: 'media-url',
          mediaUrlMode: 'any',
          itemPanel: { id: panelId, title: panelTitle, order: i },
        })
        const fileTitlePath = [...arrayPath, String(i), 'file', 'title']
        out.push({
          id: fileTitlePath.join('.'),
          label: 'File title',
          description: 'Optional; shown with the download link.',
          path: fileTitlePath,
          required: false,
          section,
          schema: { type: 'string', title: 'File title' },
          multiline: false,
          disabled: false,
          itemPanel: { id: panelId, title: panelTitle, order: i },
        })
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
      let quizQuestionKind: string | undefined
      if (
        isQuizFamilySlug(slug)
        && arrayKey === 'options'
        && parentArrayKey === 'questions'
        && arrayPath.length >= 4
      ) {
        const qIdx = arrayPath[arrayPath.length - 2]!
        const k = getValueAtPath(draft, ['payload', 'questions', qIdx, 'kind'])
        quizQuestionKind = typeof k === 'string' ? k : undefined
      }

      const useSchemeCorrectRadio =
        itemKey === 'isCorrect'
        && itemType === 'boolean'
        && (
          ((slug === 'fraud-scheme-family' || slug === 'fraud-scheme') && arrayKey === 'schemes' && !parentArrayKey)
          || (isSolveTheCaseFamilySlug(slug) && arrayKey === 'suspects' && !parentArrayKey)
          || (isSolveTheCaseFamilySlug(slug) && arrayKey === 'options' && parentArrayKey === 'supportingQuestions')
          || (isQuizFamilySlug(slug) && arrayKey === 'options' && parentArrayKey === 'questions' && quizQuestionKind === 'single_select')
        )

      const fieldRequired = itemRequired.includes(itemKey)

      const isInvestigationEvidenceUrl
        = isInvestigationActivitySlug(slug)
          && arrayKey === 'files'
          && itemKey === 'url'
          && itemType === 'string'
      const isInvestigationSuspectPhotoUrl
        = isInvestigationActivitySlug(slug)
          && arrayKey === 'suspects'
          && itemKey === 'photoUrl'
          && itemType === 'string'
      const isInvestigationQuestionLinkedFileId
        = isInvestigationActivitySlug(slug)
          && arrayKey === 'questions'
          && itemKey === 'linkedFileId'
          && itemType === 'string'
      const isFraudTriangleDocumentUrl
        = isFraudTriangleSlug(slug)
          && arrayKey === 'documents'
          && itemKey === 'url'
          && itemType === 'string'
      const isFraudTriangleDocumentPageCountReadOnly
        = isFraudTriangleSlug(slug)
          && arrayKey === 'documents'
          && itemKey === 'pageCount'
          && itemType === 'number'

      out.push({
        id: nextPath.join('.'),
        label: fieldLabel,
        description: itemProp.description,
        path: nextPath,
        required: fieldRequired,
        section,
        schema: itemProp,
        multiline: itemType === 'string' && MULTILINE_FIELD_PATTERN.test(itemKey),
        disabled: MEDIA_REFERENCE_KEYS.has(itemKey) && !isInvestigationEvidenceUrl && !isFraudTriangleDocumentUrl,
        ...(isFraudTriangleDocumentPageCountReadOnly ? { readOnly: true as const } : {}),
        itemPanel: { id: panelId, title: panelTitle, order: i },
        ...(useSchemeCorrectRadio ? { customType: 'scheme-correct-radio' as const } : {}),
        ...(isInvestigationEvidenceUrl
          ? { customType: 'media-url' as const, mediaUrlMode: 'any' as const }
          : {}),
        ...(isInvestigationSuspectPhotoUrl
          ? { customType: 'media-url' as const, mediaUrlMode: 'image' as const }
          : {}),
        ...(isFraudTriangleDocumentUrl
          ? { customType: 'media-url' as const, mediaUrlMode: 'any' as const }
          : {}),
        ...(isInvestigationQuestionLinkedFileId
          ? { customType: 'investigation-linked-file-select' as const }
          : {}),
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
  if (!properties || typeof properties !== 'object' || !schema) {
    return
  }

  const topRequired = Array.isArray(schema.required) ? schema.required : []
  const rootPayloadSchema = schema

  for (const [key, property] of Object.entries(properties)) {
    const prop = dereferenceSchemaProperty(property, rootPayloadSchema)
    if (!schemaLooksLikeArray(prop) || !prop.items) {
      continue
    }

    const items = dereferenceSchemaProperty(prop.items as JsonSchemaProperty, rootPayloadSchema)
    if (!items || !schemaLooksLikeObject(items) || !items.properties) {
      continue
    }

    emitPayloadArrayObjectFields(
      out,
      draft,
      key,
      prop,
      [...basePath, key],
      section,
      options,
      topRequired,
      undefined,
      rootPayloadSchema,
    )
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
  appendContentCardMediaExternalFileFields(fields, normalizedDraft, options)
  appendVideoActivityMediaFields(fields, options)
  appendArrayObjectScalarFields(fields, normalizedDraft, contract.payload?.schema, 'payload', ['payload'], options)
  reorderIntroContentCardPayloadStandaloneFields(fields, options)
  reorderFraudTrianglePayloadStandaloneFields(fields, options)
  reorderFraudSchemePayloadStandaloneFields(fields, options)
  omitLegacyFraudTrianglePayloadFormFields(fields, options)

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
  options?: BuildFormFieldsOptions,
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
  const skipFraudLegacyArrays
    = isFraudTriangleSlug(options?.componentSlug)
      ? new Set(['images', 'pdfs'])
      : null

  for (const [key, property] of Object.entries(properties)) {
    if (skipFraudLegacyArrays?.has(key)) {
      continue
    }
    const prop = dereferenceSchemaProperty(property, schema)
    if (!schemaLooksLikeArray(prop) || !prop.items) {
      continue
    }
    const items = dereferenceSchemaProperty(prop.items as JsonSchemaProperty, schema)
    if (!items || !schemaLooksLikeObject(items) || !items.properties) {
      continue
    }

    const minItems = typeof prop.minItems === 'number'
      ? prop.minItems
      : (topRequired.includes(key) ? 1 : 0)

    out.push({
      arrayPath: ['payload', key],
      label: prop.title || humanizeKey(key),
      minItems,
      itemTemplate: itemTemplateFromProperties(items.properties),
    })
  }

  return out
}

/** Last non-numeric segment of a draft path, e.g. `['payload','questions','0','options']` → `options`. */
export function arrayFieldKeyFromArrayPath(arrayPath: string[]): string {
  for (let i = arrayPath.length - 1; i >= 0; i--) {
    const seg = arrayPath[i]!
    if (seg && !/^\d+$/.test(seg)) {
      return seg
    }
  }
  return 'row'
}

/**
 * When a row object includes an `id` property (per contract), fill it with `{arrayKey}-{timestamp}-{random}`
 * if it is missing or blank. Does not add an `id` key if the schema row has no `id` field.
 */
export function assignTimestampIdToPayloadRowIfApplicable(
  row: Record<string, unknown>,
  arrayFieldKey: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(row, 'id')) {
    return
  }
  const id = row.id
  if (typeof id === 'string' && id.trim() !== '') {
    return
  }
  row.id = `${arrayFieldKey}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Fraud scheme rows: hidden `id` in the form. */
function ensureFraudSchemesHaveIds(draft: Record<string, unknown>): void {
  const rows = getValueAtPath(draft, ['payload', 'schemes'])
  if (!Array.isArray(rows)) {
    return
  }
  for (const row of rows) {
    if (row && typeof row === 'object') {
      assignTimestampIdToPayloadRowIfApplicable(row as Record<string, unknown>, 'schemes')
    }
  }
}

/** Solve-the-case: suspects, supporting questions, and per-question options. */
function ensureSolveTheCaseFamilyIds(draft: Record<string, unknown>): void {
  const suspects = getValueAtPath(draft, ['payload', 'suspects'])
  if (Array.isArray(suspects)) {
    for (const row of suspects) {
      if (row && typeof row === 'object') {
        assignTimestampIdToPayloadRowIfApplicable(row as Record<string, unknown>, 'suspects')
      }
    }
  }
  const questions = getValueAtPath(draft, ['payload', 'supportingQuestions'])
  if (!Array.isArray(questions)) {
    return
  }
  for (const q of questions) {
    if (q && typeof q === 'object') {
      assignTimestampIdToPayloadRowIfApplicable(q as Record<string, unknown>, 'supportingQuestions')
    }
    const opts = (q as Record<string, unknown>).options
    if (!Array.isArray(opts)) {
      continue
    }
    for (const o of opts) {
      if (o && typeof o === 'object') {
        assignTimestampIdToPayloadRowIfApplicable(o as Record<string, unknown>, 'options')
      }
    }
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
  const row: Record<string, unknown> = { ...itemTemplate }
  arr.push(row)
  setValueAtPath(next, arrayPath, arr)
  assignTimestampIdToPayloadRowIfApplicable(row, arrayFieldKeyFromArrayPath(arrayPath))
  if (arrayPath[0] === 'payload') {
    ensureFraudSchemesHaveIds(next)
    ensureSolveTheCaseFamilyIds(next)
    // Only heal investigation file rows when a row is appended to `payload.files`
    // itself. Running these on every append (e.g. `payload.questions`) caused
    // unrelated rows to re-render and made add-row / collapsible interactions
    // feel "stuck" because the files array reference changed on every click.
    if (arrayPath.length === 2 && arrayPath[1] === 'files') {
      ensureInvestigationFileIds(next)
      ensureInvestigationFilePositions(next)
    }
  }
  if (
    arrayPath.length >= 2
    && arrayPath[0] === 'payload'
    && arrayPath[1] === 'attachments'
  ) {
    row[PAYLOAD_ATTACHMENT_UI_ROW_KEY] = `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const file = row.file
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      row.file = { source: 'external', url: '', title: '' }
    }
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

/** Replace payload array contents with a reordered shallow copy (same object references). */
export function reorderPayloadArrayItemsAtPath(
  draft: Record<string, unknown>,
  arrayPath: string[],
  newItems: unknown[],
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)
  setValueAtPath(next, arrayPath, [...newItems])
  return next
}

type ArrayFieldSchemaDescribe = {
  arrayPropertySchema: JsonSchemaProperty
  fieldKey: string
  parentObjectRequired: string[]
  parentArrayPropertyKey?: string
}

/**
 * `draftArrayPath` points at an array value in the draft, e.g. `['payload','questions','0','options']`.
 * Returns schema for that array property (must be array of objects).
 */
function describePayloadArrayFieldSchema(
  rootPayloadSchema: JsonSchemaProperty | undefined,
  draftArrayPath: string[],
): ArrayFieldSchemaDescribe | null {
  if (!rootPayloadSchema || draftArrayPath[0] !== 'payload' || draftArrayPath.length < 2) {
    return null
  }
  const pathWithinPayload = draftArrayPath.slice(1)
  const fieldKey = pathWithinPayload[pathWithinPayload.length - 1]
  if (!fieldKey || /^\d+$/.test(fieldKey)) {
    return null
  }

  const segments = pathWithinPayload.slice(0, -1)
  let objSchema: JsonSchemaProperty | undefined = rootPayloadSchema
  let parentArrayPropertyKey: string | undefined
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]!
    if (/^\d+$/.test(seg)) {
      i++
      continue
    }
    const rawProp = objSchema.properties?.[seg]
    const prop = dereferenceSchemaProperty(rawProp, rootPayloadSchema)
    if (!prop) {
      return null
    }
    const nextSeg = segments[i + 1]
    if (nextSeg !== undefined && /^\d+$/.test(nextSeg)) {
      if (!schemaLooksLikeArray(prop) || !prop.items) {
        return null
      }
      const items = dereferenceSchemaProperty(prop.items as JsonSchemaProperty, rootPayloadSchema)
      if (!items || !schemaLooksLikeObject(items)) {
        return null
      }
      parentArrayPropertyKey = seg
      objSchema = items
      i += 2
    } else if (schemaLooksLikeObject(prop) && prop.properties) {
      objSchema = prop
      i++
    } else {
      return null
    }
  }

  const rawArrayProp = objSchema.properties?.[fieldKey]
  const arrayProp = dereferenceSchemaProperty(rawArrayProp, rootPayloadSchema)
  if (!arrayProp || !schemaLooksLikeArray(arrayProp) || !arrayProp.items) {
    return null
  }
  const itemSch = dereferenceSchemaProperty(arrayProp.items as JsonSchemaProperty, rootPayloadSchema)
  if (!itemSch || !schemaLooksLikeObject(itemSch) || !itemSch.properties) {
    return null
  }

  const parentObjectRequired = Array.isArray(objSchema.required) ? objSchema.required : []
  return {
    arrayPropertySchema: arrayProp,
    fieldKey,
    parentObjectRequired,
    parentArrayPropertyKey,
  }
}

function minItemsForDescribedPayloadArray(
  described: ArrayFieldSchemaDescribe,
  componentSlug: string | undefined,
): number {
  const { arrayPropertySchema, fieldKey, parentObjectRequired, parentArrayPropertyKey } = described
  let minItems = typeof arrayPropertySchema.minItems === 'number'
    ? arrayPropertySchema.minItems
    : (parentObjectRequired.includes(fieldKey) ? 1 : 0)

  if (
    isSolveTheCaseFamilySlug(componentSlug || '')
    && fieldKey === 'options'
    && parentArrayPropertyKey === 'supportingQuestions'
    && minItems < 1
  ) {
    minItems = 1
  }

  return minItems
}

export type PayloadArrayRemovalTarget = {
  arrayPath: string[]
  index: number
  minItems: number
}

export type ResolvePayloadArrayRowRemovalOptions = {
  componentSlug?: string
}

/**
 * Item panel ids are `path.to.array.N` (see `emitPayloadArrayObjectFields`). Resolves the draft
 * array path, row index, and `minItems` from the compiled payload schema (including nested arrays
 * like quiz `questions[].options` and solve-the-case `supportingQuestions[].options`).
 */
export function resolvePayloadArrayRowRemoval(
  itemPanelId: string,
  compiledContract: Record<string, unknown> | null | undefined,
  options?: ResolvePayloadArrayRowRemovalOptions,
): PayloadArrayRemovalTarget | null {
  const parts = itemPanelId.split('.')
  if (parts.length < 3) {
    return null
  }
  const last = parts[parts.length - 1]
  if (!last || !/^\d+$/.test(last)) {
    return null
  }
  const index = Number.parseInt(last, 10)
  const arrayPath = parts.slice(0, -1)
  if (arrayPath[0] !== 'payload') {
    return null
  }

  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty } } | null | undefined
  const payloadSchema = contract?.payload?.schema
  const described = describePayloadArrayFieldSchema(payloadSchema, arrayPath)
  if (!described) {
    return null
  }

  const minItems = minItemsForDescribedPayloadArray(described, options?.componentSlug)
  return { arrayPath, index, minItems }
}

export function getPayloadArrayDescriptorAtPath(
  compiledContract: Record<string, unknown> | null | undefined,
  arrayPath: string[],
  options?: { componentSlug?: string },
): PayloadArrayDescriptor | null {
  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty } } | null | undefined
  const root = contract?.payload?.schema
  const described = describePayloadArrayFieldSchema(root, arrayPath)
  if (!described) {
    return null
  }
  const itemsResolved = dereferenceSchemaProperty(
    described.arrayPropertySchema.items as JsonSchemaProperty,
    root || {},
  )
  if (!itemsResolved?.properties) {
    return null
  }
  const minItems = minItemsForDescribedPayloadArray(described, options?.componentSlug)
  const label = described.arrayPropertySchema.title || humanizeKey(described.fieldKey)
  return {
    arrayPath,
    label,
    minItems,
    itemTemplate: itemTemplateFromProperties(itemsResolved.properties),
  }
}

/**
 * Ensure array-of-object payload keys meet contract min length (e.g. decision-point options minItems: 2).
 */
export function padPayloadArraysFromContract(
  draft: Record<string, unknown>,
  compiledContract: Record<string, unknown> | null | undefined,
  options?: BuildFormFieldsOptions,
): Record<string, unknown> {
  const next = normalizePropsDraft(draft)
  const descriptors = listPayloadArrayDescriptors(compiledContract, options)
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
    const fieldKey = arrayFieldKeyFromArrayPath(arrayPath)
    for (const row of arr) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        assignTimestampIdToPayloadRowIfApplicable(row as Record<string, unknown>, fieldKey)
      }
    }
  }
  ensureFraudSchemesHaveIds(next)
  ensureSolveTheCaseFamilyIds(next)
  ensureInvestigationFileIds(next)
  ensureInvestigationFilePositions(next)
  seedVideoActivityPayloadDefaults(next, options?.componentSlug)
  return next
}

function seedVideoActivityPayloadDefaults(next: Record<string, unknown>, slug: string | undefined): void {
  if (!isVideoActivitySlug(slug)) {
    return
  }
  const payload = getValueAtPath(next, ['payload'])
  if (!isRecord(payload)) {
    return
  }

  if (!isRecord(payload.video)) {
    payload.video = { source: 'external', url: '', title: '' }
  } else {
    const v = payload.video as Record<string, unknown>
    if (v.source !== 'library' && v.source !== 'external') {
      v.source = 'external'
    }
    if (typeof v.url !== 'string') {
      v.url = ''
    }
  }

  if (payload.poster !== undefined && payload.poster !== null) {
    if (!isRecord(payload.poster)) {
      payload.poster = { source: 'external', url: '', alt: '' }
    } else {
      const po = payload.poster as Record<string, unknown>
      if (po.source !== 'library' && po.source !== 'external') {
        po.source = 'external'
      }
    }
  }

  const attachments = payload.attachments
  if (Array.isArray(attachments)) {
    for (const row of attachments) {
      if (!isRecord(row)) {
        continue
      }
      const file = row.file
      if (!isRecord(file)) {
        row.file = { source: 'external', url: '', title: '' }
      } else {
        const f = file as Record<string, unknown>
        if (f.source !== 'library' && f.source !== 'external') {
          f.source = 'external'
        }
        if (typeof f.url !== 'string') {
          f.url = ''
        }
      }
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function walkNestedPayloadArrayDescriptors(
  obj: Record<string, unknown>,
  objSchema: JsonSchemaProperty,
  pathPrefix: string[],
  rootPayloadSchema: JsonSchemaProperty,
  compiledContract: Record<string, unknown>,
  componentSlug: string | undefined,
  seen: Set<string>,
  out: PayloadArrayDescriptor[],
): void {
  const props = objSchema.properties
  if (!props) {
    return
  }
  for (const key of Object.keys(props)) {
    const rawProp = props[key]
    const propSchema = dereferenceSchemaProperty(rawProp, rootPayloadSchema)
    if (!propSchema) {
      continue
    }
    const val = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined

    if (
      key === 'options'
      && isQuizFamilySlug(componentSlug)
      && pathPrefix.length >= 2
      && pathPrefix[pathPrefix.length - 2] === 'questions'
      && isRecord(obj)
      && obj.kind === 'text'
    ) {
      continue
    }

    if (schemaLooksLikeArray(propSchema)) {
      const quizQuestionNonTextOptions =
        key === 'options'
        && isQuizFamilySlug(componentSlug)
        && pathPrefix.length >= 2
        && pathPrefix[pathPrefix.length - 2] === 'questions'
        && isRecord(obj)
        && obj.kind !== 'text'

      let listVal: unknown[] | null = null
      if (Array.isArray(val)) {
        listVal = val
      } else if (quizQuestionNonTextOptions && (val === undefined || val === null)) {
        listVal = []
      }

      if (listVal === null) {
        continue
      }

      const items = dereferenceSchemaProperty(propSchema.items as JsonSchemaProperty, rootPayloadSchema)
      if (items && schemaLooksLikeObject(items) && items.properties) {
        const arrayPath = [...pathPrefix, key]
        const sig = arrayPath.join('.')
        if (!seen.has(sig)) {
          seen.add(sig)
          const desc = getPayloadArrayDescriptorAtPath(compiledContract, arrayPath, { componentSlug })
          if (desc) {
            out.push(desc)
          }
        }
        for (let i = 0; i < listVal.length; i++) {
          const el = listVal[i]
          if (isRecord(el)) {
            walkNestedPayloadArrayDescriptors(
              el,
              items,
              [...pathPrefix, key, String(i)],
              rootPayloadSchema,
              compiledContract,
              componentSlug,
              seen,
              out,
            )
          }
        }
      }
    } else if (isRecord(val) && schemaLooksLikeObject(propSchema) && propSchema.properties) {
      walkNestedPayloadArrayDescriptors(
        val,
        propSchema,
        [...pathPrefix, key],
        rootPayloadSchema,
        compiledContract,
        componentSlug,
        seen,
        out,
      )
    }
  }
}

/**
 * All payload object-array paths present in the draft (including nested), for add-row controls.
 */
export function collectNestedPayloadArrayDescriptors(
  draft: Record<string, unknown>,
  compiledContract: Record<string, unknown> | null | undefined,
  options?: { componentSlug?: string },
): PayloadArrayDescriptor[] {
  if (!compiledContract || typeof compiledContract !== 'object') {
    return []
  }
  const contract = compiledContract as { payload?: { schema?: JsonSchemaProperty } }
  const root = contract.payload?.schema
  if (!root) {
    return []
  }
  const payload = getValueAtPath(draft, ['payload'])
  if (!isRecord(payload)) {
    return []
  }
  const seen = new Set<string>()
  const out: PayloadArrayDescriptor[] = []
  walkNestedPayloadArrayDescriptors(
    payload,
    root,
    ['payload'],
    root,
    compiledContract as Record<string, unknown>,
    options?.componentSlug,
    seen,
    out,
  )
  return out
}

/** `payload.schemes.2` → `payload.schemes` */
export function payloadArrayListPathFromPanelId(panelId: string): string | null {
  const parts = panelId.split('.')
  if (parts.length < 3) {
    return null
  }
  const last = parts[parts.length - 1]
  if (!last || !/^\d+$/.test(last)) {
    return null
  }
  return parts.slice(0, -1).join('.')
}

/** Longest other panel id that is a proper prefix of `panelId` (direct parent row panel). */
export function parentPayloadPanelId(panelId: string, allPanelIds: Iterable<string>): string | null {
  let best: string | null = null
  for (const id of allPanelIds) {
    if (id === panelId || !panelId.startsWith(`${id}.`)) {
      continue
    }
    if (!best || id.length > best.length) {
      best = id
    }
  }
  return best
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

function ensurePayloadAttachmentUiRowKeys(payload: Record<string, unknown>): void {
  const attachments = payload.attachments
  if (!Array.isArray(attachments)) {
    return
  }
  for (const row of attachments) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const r = row as Record<string, unknown>
    const existing = r[PAYLOAD_ATTACHMENT_UI_ROW_KEY]
    if (typeof existing === 'string' && existing.trim() !== '') {
      continue
    }
    r[PAYLOAD_ATTACHMENT_UI_ROW_KEY] = `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

/**
 * Remove editor-only keys from `payload.attachments` before persisting to the API
 * (schema uses `additionalProperties: false` on attachment items).
 */
export function stripPayloadAttachmentsEditorKeys(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const attachments = payload.attachments
  if (!Array.isArray(attachments)) {
    return payload
  }
  return {
    ...payload,
    attachments: attachments.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return row
      }
      const { [PAYLOAD_ATTACHMENT_UI_ROW_KEY]: _, ...rest } = row as Record<string, unknown>
      return rest
    }),
  }
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
  ensurePayloadAttachmentUiRowKeys(next.payload as Record<string, unknown>)
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

  if (field.customType === 'string-array-lines') {
    if (Array.isArray(value)) {
      setValueAtPath(next, field.path, value.map(v => String(v).trim()))
      return next
    }
    const raw = typeof value === 'string' ? value : String(value ?? '')
    const lines = raw
      .split(/\r?\n/)
      .map(line => line.trim())
    setValueAtPath(next, field.path, lines)
    return next
  }

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

  const p = field.path
  if (
    p.length >= 4
    && p[0] === 'payload'
    && p[1] === 'questions'
    && /^\d+$/.test(String(p[2]))
    && p[p.length - 1] === 'kind'
    && value === 'text'
  ) {
    setValueAtPath(next, [...p.slice(0, -1), 'options'], [])
  }

  if (
    p.length >= 4
    && p[0] === 'payload'
    && p[1] === 'questions'
    && /^\d+$/.test(String(p[2]))
    && p[p.length - 1] === 'kind'
    && (value === 'single_select' || value === 'multi_select')
  ) {
    const optPath = [...p.slice(0, -1), 'options']
    const cur = getValueAtPath(next, optPath)
    if (!Array.isArray(cur)) {
      setValueAtPath(next, optPath, [])
    }
  }

  return next
}
