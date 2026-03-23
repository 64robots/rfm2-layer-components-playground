<script setup lang="ts">
import type {
  ComponentsCatalogDetailPayload,
  ComponentsCatalogItem,
  ComponentsCatalogPayload,
} from '../../types/components-playground'
import { useComponentsPlaygroundAdapter } from '../../composables/components-playground/useComponentsPlaygroundAdapter'
import { useComponentsRuntime } from '../../composables/components-playground/useComponentsRuntime'

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
type DetailTab = 'form' | 'metadata' | 'schema' | 'contract' | 'a11y'
type FormSection = 'payload' | 'config'
type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown'

type JsonSchemaProperty = {
  type?: string | string[]
  enum?: unknown[]
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

type FormField = {
  id: string
  label: string
  description?: string
  path: string[]
  required: boolean
  section: FormSection
  schema: JsonSchemaProperty
  multiline: boolean
  disabled: boolean
}

type A11yViolation = {
  id: string
  impact: A11yImpact
  description: string
  help: string
  helpUrl?: string
  nodes: number
}

type A11yAuditState = {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'error'
  checkedAt: string | null
  counts: Record<A11yImpact, number>
  violations: A11yViolation[]
  error: string | null
}

type ThemeColors = {
  background: string
  foreground: string
  surface: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  danger: string
  warning: string
}

type ContrastRow = {
  pair: string
  foreground: string
  background: string
  ratio: number
  passesAA: boolean
}

const DEFAULT_THEME_COLORS: ThemeColors = {
  background: '#ffffff',
  foreground: '#0f172a',
  surface: '#f8fafc',
  primary: '#1e3a8a',
  primaryForeground: '#ffffff',
  secondary: '#e2e8f0',
  secondaryForeground: '#0f172a',
  danger: '#dc2626',
  warning: '#f59e0b',
}

const VIEWPORT_FRAME_STYLES: Record<ViewportMode, Record<string, string>> = {
  desktop: {
    width: '100%',
    height: '100%',
  },
  tablet: {
    width: 'min(calc(100% - 0.75rem), 900px, calc((100dvh - 18rem) * 0.9184))',
    aspectRatio: '900 / 980',
    maxHeight: 'min(980px, calc(100dvh - 18rem))',
  },
  mobile: {
    width: 'min(calc(100% - 0.75rem), 420px, calc((100dvh - 18rem) * 0.5527))',
    aspectRatio: '420 / 760',
    maxHeight: 'min(760px, calc(100dvh - 18rem))',
  },
}

const MEDIA_REFERENCE_KEYS = new Set(['src', 'url', 'imageUrl', 'thumbnailUrl', 'mediaUuid'])
const MULTILINE_FIELD_PATTERN = /(body|instructions|description|note|text|content|transcript)/i

const route = useRoute()
const router = useRouter()
const runtimeConfig = useRuntimeConfig()
const adapter = useComponentsPlaygroundAdapter()
const runtime = useComponentsRuntime()

const mountSelector = '#rfm-components-playground-mount'
const iframeRef = ref<HTMLIFrameElement | null>(null)

const slug = computed(() => String(route.params.slug || '').trim())
const hostMode = computed(() => String(runtimeConfig.public.componentsPlaygroundHost || 'builder'))
const isDeveloperHost = computed(() => hostMode.value === 'playground')

const loading = ref(false)
const loadError = ref('')
const runtimeError = ref('')

const catalog = ref<ComponentsCatalogPayload | null>(null)
const detail = ref<ComponentsCatalogDetailPayload | null>(null)

const viewport = ref<ViewportMode>('desktop')
const activeTab = ref<DetailTab>('form')
const propsDraft = ref<Record<string, unknown>>({})
const themeColors = ref<ThemeColors>({ ...DEFAULT_THEME_COLORS })
const a11yAudit = ref<A11yAuditState>(createEmptyA11yAudit())
const themeVariant = ref<'default' | 'rfm-classic'>('rfm-classic')

const availableComponents = computed<ComponentsCatalogItem[]>(() => catalog.value?.components || [])
const availableSlugs = computed<string[]>(() => availableComponents.value.map((item) => item.slug))

const selectedSlug = computed({
  get: () => slug.value,
  set: async (value: string) => {
    if (!value || value === slug.value) {
      return
    }

    await router.push(`/components/${value}`)
  },
})

const viewportItems: Array<{ label: string, value: ViewportMode }> = [
  { label: 'Desktop', value: 'desktop' },
  { label: 'Tablet', value: 'tablet' },
  { label: 'Mobile', value: 'mobile' },
]

const tabItems = computed<Array<{ label: string, value: DetailTab }>>(() => {
  const items: Array<{ label: string, value: DetailTab }> = [{ label: 'Form', value: 'form' }]

  if (isDeveloperHost.value) {
    items.push(
      { label: 'Metadata', value: 'metadata' },
      { label: 'Schema', value: 'schema' },
      { label: 'Contract', value: 'contract' },
    )
  }

  items.push({ label: 'A11y', value: 'a11y' })
  return items
})

const highContrastTabsUi = {
  list: 'bg-zinc-100 rounded-lg',
  indicator: 'rounded-md shadow-xs bg-zinc-900',
  trigger: 'data-[state=inactive]:text-zinc-800 hover:data-[state=inactive]:not-disabled:text-zinc-950 data-[state=active]:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900',
}

const resolutionLabel = computed(() => {
  if (!detail.value) {
    return ''
  }

  return `${detail.value.releaseId || 'unresolved'} (${detail.value.channel})`
})

const viewportFrameStyle = computed(() => VIEWPORT_FRAME_STYLES[viewport.value])

const formFields = computed<FormField[]>(() => {
  const contract = detail.value?.compiledContract
  if (!contract || typeof contract !== 'object') {
    return []
  }

  const fields: FormField[] = []
  collectSchemaFields(fields, contract.payload?.schema as JsonSchemaProperty | undefined, 'payload', ['payload'])
  collectSchemaFields(fields, contract.config?.schema as JsonSchemaProperty | undefined, 'config', ['config'])
  return fields
})

const visibleFormFields = computed(() => formFields.value.filter(field => !shouldHideField(field)))

const contrastMatrix = computed<ContrastRow[]>(() => {
  const colors = themeColors.value
  const pairs = [
    { pair: 'primary / primaryForeground', foreground: colors.primaryForeground, background: colors.primary },
    { pair: 'surface / foreground', foreground: colors.foreground, background: colors.surface },
    { pair: 'background / foreground', foreground: colors.foreground, background: colors.background },
    { pair: 'secondary / secondaryForeground', foreground: colors.secondaryForeground, background: colors.secondary },
    { pair: 'danger / primaryForeground', foreground: colors.primaryForeground, background: colors.danger },
    { pair: 'warning / foreground', foreground: colors.foreground, background: colors.warning },
  ]

  return pairs.map((entry) => {
    const ratio = contrastRatio(entry.foreground, entry.background)
    return {
      ...entry,
      ratio,
      passesAA: ratio >= 4.5,
    }
  })
})

const a11yStatusLabel = computed(() => {
  switch (a11yAudit.value.status) {
    case 'running':
      return 'Running'
    case 'passed':
      return 'Passed'
    case 'failed':
      return 'Failed'
    case 'error':
      return 'Error'
    default:
      return 'Not Run'
  }
})

const a11yStatusColor = computed(() => {
  switch (a11yAudit.value.status) {
    case 'passed':
      return 'success'
    case 'failed':
    case 'error':
      return 'error'
    case 'running':
      return 'warning'
    default:
      return 'neutral'
  }
})

watch(tabItems, (items) => {
  if (!items.some((item) => item.value === activeTab.value)) {
    activeTab.value = 'form'
  }
}, { immediate: true })

function createEmptyA11yAudit(): A11yAuditState {
  return {
    status: 'idle',
    checkedAt: null,
    counts: createA11yCounts(),
    violations: [],
    error: null,
  }
}

function createA11yCounts(): Record<A11yImpact, number> {
  return {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  }
}

function cloneDraftValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T
}

function normalizeDraft(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
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

function setDraftFromObject(value: Record<string, unknown> | null | undefined) {
  propsDraft.value = normalizeDraft(value)
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

function getSchemaType(schema: JsonSchemaProperty | undefined): string | null {
  if (!schema) {
    return null
  }

  if (Array.isArray(schema.type)) {
    return schema.type.find((value) => value !== 'null') || null
  }

  return typeof schema.type === 'string' ? schema.type : null
}

function collectSchemaFields(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getValueAtPath(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined
    }

    return current[segment]
  }, source)
}

function setValueAtPath(source: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
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

function getFieldValue(field: FormField): unknown {
  return getValueAtPath(propsDraft.value, field.path)
}

function isContentCardBodyField(field: FormField): boolean {
  return detail.value?.slug === 'intro-card' && field.id === 'payload.body'
}

function isVideoDescriptionField(field: FormField): boolean {
  return detail.value?.slug === 'video' && field.id === 'payload.description'
}

function isContentCardMediaSrcField(field: FormField): boolean {
  return detail.value?.slug === 'intro-card' && field.id === 'payload.media.src'
}

function shouldHideField(field: FormField): boolean {
  return detail.value?.slug === 'intro-card' && field.id === 'payload.media.alt'
}

function getContentCardMediaAlt(): string {
  const value = getValueAtPath(propsDraft.value, ['payload', 'media', 'alt'])
  return typeof value === 'string' ? value : ''
}

async function updateField(field: FormField, value: unknown) {
  const next = normalizeDraft(propsDraft.value)

  if (getSchemaType(field.schema) === 'number') {
    const parsed = Number(value)
    setValueAtPath(next, field.path, Number.isNaN(parsed) ? value : parsed)
  } else if (getSchemaType(field.schema) === 'boolean') {
    setValueAtPath(next, field.path, Boolean(value))
  } else {
    setValueAtPath(next, field.path, value)
  }

  propsDraft.value = next
  await renderComponent()
}

async function updateContentCardMediaField(path: string[], value: unknown): Promise<void> {
  const next = normalizeDraft(propsDraft.value)
  setValueAtPath(next, path, value)

  const currentKind = getValueAtPath(next, ['payload', 'media', 'kind'])
  if (typeof getValueAtPath(next, ['payload', 'media', 'src']) === 'string' && getValueAtPath(next, ['payload', 'media', 'src'])) {
    setValueAtPath(next, ['payload', 'media', 'kind'], currentKind === 'video' ? 'video' : 'image')
  }

  propsDraft.value = next
  await renderComponent()
}

function clearA11y() {
  a11yAudit.value = createEmptyA11yAudit()
}

async function ensureRuntimeLoaded() {
  runtimeError.value = ''

  try {
    await runtime.loadRuntime()
  } catch (error: unknown) {
    runtimeError.value = error instanceof Error ? error.message : 'Failed to load runtime bundle.'
    throw error
  }
}

function getIframeDocument(): Document | null {
  return iframeRef.value?.contentDocument ?? null
}

function getIframeWindow(): (Window & typeof globalThis) | null {
  return iframeRef.value?.contentWindow as (Window & typeof globalThis) | null
}

function readThemeColors(): ThemeColors {
  const iframeDoc = getIframeDocument()
  const mountEl = iframeDoc?.querySelector(mountSelector)
  const themeRoot = mountEl?.querySelector('.rfm-theme') || mountEl
  if (!themeRoot) {
    return { ...DEFAULT_THEME_COLORS }
  }

  const iframeWin = getIframeWindow()
  if (!iframeWin) {
    return { ...DEFAULT_THEME_COLORS }
  }

  const styles = iframeWin.getComputedStyle(themeRoot)
  return {
    background: styles.getPropertyValue('--rfm-background').trim() || DEFAULT_THEME_COLORS.background,
    foreground: styles.getPropertyValue('--rfm-foreground').trim() || DEFAULT_THEME_COLORS.foreground,
    surface: styles.getPropertyValue('--rfm-surface').trim() || DEFAULT_THEME_COLORS.surface,
    primary: styles.getPropertyValue('--rfm-primary').trim() || DEFAULT_THEME_COLORS.primary,
    primaryForeground: styles.getPropertyValue('--rfm-primary-foreground').trim() || DEFAULT_THEME_COLORS.primaryForeground,
    secondary: styles.getPropertyValue('--rfm-secondary').trim() || DEFAULT_THEME_COLORS.secondary,
    secondaryForeground: styles.getPropertyValue('--rfm-secondary-foreground').trim() || DEFAULT_THEME_COLORS.secondaryForeground,
    danger: styles.getPropertyValue('--rfm-danger').trim() || DEFAULT_THEME_COLORS.danger,
    warning: styles.getPropertyValue('--rfm-warning').trim() || DEFAULT_THEME_COLORS.warning,
  }
}

async function prepareIframe(): Promise<void> {
  const iframe = iframeRef.value
  if (!iframe) {
    throw new Error('Preview iframe not available.')
  }

  const iframeDoc = iframe.contentDocument
  const iframeWin = iframe.contentWindow
  if (!iframeDoc || !iframeWin) {
    throw new Error('Cannot access preview iframe document.')
  }

  if (iframeDoc.querySelector(mountSelector)) {
    return
  }

  const res = runtime.resolution.value
  if (!res) {
    throw new Error('Resolution not available.')
  }

  const cssUrl = res.bundleCssUrl || resolvePreviewAssetUrl(res.cdnBaseUrl, res.bundleCssKey)
  const runtimeUrl = res.vueEsmUrl || resolvePreviewAssetUrl(res.cdnBaseUrl, res.vueEsmKey)

  iframeDoc.open()
  iframeDoc.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${cssUrl}">
<style>html,body{margin:0;padding:0;height:100%;background:#fff;}</style>
</head><body>
<div id="rfm-components-playground-mount" style="min-height:320px;padding:16px;"></div>
<script type="module" src="${runtimeUrl}"><\/script>
</body></html>`)
  iframeDoc.close()

  for (let i = 0; i < 100; i++) {
    if (iframeWin.__RFM_COMPONENTS_VUE__) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Timed out waiting for runtime inside preview iframe.')
}

function resolvePreviewAssetUrl(cdnBaseUrl: string, key: string): string {
  if (/^https?:\/\//i.test(String(key || ''))) {
    return String(key)
  }
  const trimmedBase = String(cdnBaseUrl || '').replace(/\/+$/, '')
  const trimmedKey = String(key || '').replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedKey}`
}

async function renderComponent() {
  if (!detail.value) {
    return
  }

  await ensureRuntimeLoaded()
  await prepareIframe()

  const iframeWin = getIframeWindow()
  const iframeRuntime = iframeWin?.__RFM_COMPONENTS_VUE__
  if (!iframeRuntime) {
    throw new Error('Runtime not available inside preview iframe.')
  }

  iframeRuntime.renderPod({
    slug: detail.value.slug,
    mountSelector,
    props: propsDraft.value,
    themeVariant: themeVariant.value,
  })

  await nextTick()
  themeColors.value = readThemeColors()
}

async function runA11yChecks() {
  if (a11yAudit.value.status === 'running') {
    return
  }

  const iframeDoc = getIframeDocument()
  const mountEl = iframeDoc?.querySelector(mountSelector)
  if (!mountEl) {
    a11yAudit.value = {
      ...createEmptyA11yAudit(),
      status: 'error',
      error: 'Preview mount element not found.',
    }
    return
  }

  a11yAudit.value = {
    ...createEmptyA11yAudit(),
    status: 'running',
  }

  try {
    const axeModule = await import('axe-core')
    const axeCore = (axeModule as unknown as { default?: typeof import('axe-core') }).default ?? axeModule
    const result = await axeCore.run(mountEl, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
      rules: {
        region: { enabled: false },
      },
    })

    const counts = createA11yCounts()
    const violations = result.violations.map((violation) => {
      const impact = (violation.impact || 'unknown') as A11yImpact
      counts[impact] += 1

      return {
        id: violation.id,
        impact,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.length,
      }
    })

    a11yAudit.value = {
      status: violations.length > 0 ? 'failed' : 'passed',
      checkedAt: new Date().toISOString(),
      counts,
      violations,
      error: null,
    }
  } catch (error: unknown) {
    a11yAudit.value = {
      ...createEmptyA11yAudit(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Accessibility audit failed.',
      checkedAt: new Date().toISOString(),
    }
  }
}

function parseColorToRgb(color: string): { r: number, g: number, b: number } | null {
  const normalized = color.trim().toLowerCase()
  const hex = normalized.replace('#', '')

  if (/^[0-9a-f]{3}$/.test(hex)) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
    }
  }

  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    }
  }

  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/)
  if (!rgbMatch) {
    return null
  }

  const parts = rgbMatch[1]?.split(',').map((part) => Number.parseFloat(part.trim())) ?? []
  if (parts.length < 3 || parts.some((value) => Number.isNaN(value))) {
    return null
  }

  return {
    r: Math.max(0, Math.min(255, parts[0] ?? 0)),
    g: Math.max(0, Math.min(255, parts[1] ?? 0)),
    b: Math.max(0, Math.min(255, parts[2] ?? 0)),
  }
}

function srgbToLinear(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance(rgb: { r: number, g: number, b: number }): number {
  return (0.2126 * srgbToLinear(rgb.r)) + (0.7152 * srgbToLinear(rgb.g)) + (0.0722 * srgbToLinear(rgb.b))
}

function contrastRatio(foreground: string, background: string): number {
  const fg = parseColorToRgb(foreground)
  const bg = parseColorToRgb(background)
  if (!fg || !bg) {
    return 0
  }

  const lighter = Math.max(getRelativeLuminance(fg), getRelativeLuminance(bg))
  const darker = Math.min(getRelativeLuminance(fg), getRelativeLuminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}

async function loadData() {
  if (!slug.value) {
    loadError.value = 'Missing component slug.'
    return
  }

  loading.value = true
  loadError.value = ''

  try {
    const [catalogPayload, detailPayload] = await Promise.all([
      adapter.fetchCatalog(),
      adapter.fetchCatalogDetail(slug.value),
      runtime.resolveResolution(true),
    ])

    catalog.value = catalogPayload
    detail.value = detailPayload
    setDraftFromObject(detailPayload.defaultConfig as Record<string, unknown> | null)
    clearA11y()
    await nextTick()
    await renderComponent()
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load component details.'
  } finally {
    loading.value = false
  }
}

function unmountFromIframe() {
  const iframeWin = getIframeWindow()
  const iframeRuntime = iframeWin?.__RFM_COMPONENTS_VUE__
  if (iframeRuntime) {
    iframeRuntime.unmount({ mountSelector })
  }
}

watch(
  () => slug.value,
  async () => {
    unmountFromIframe()
    await loadData()
  },
)

onMounted(async () => {
  await loadData()
})

onBeforeUnmount(() => {
  unmountFromIframe()
})
</script>

<template>
  <div class="h-full min-w-0 p-4 md:p-5">
    <div class="flex h-full min-w-0 overflow-hidden">
      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div class="flex items-center border-b border-default bg-default p-4">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold">
              {{ detail?.label || slug || 'Component' }}
              <span v-if="detail?.slug" class="text-xs text-muted">({{ detail.slug }})</span>
            </div>
            <p v-if="detail?.description" class="mt-1 line-clamp-2 text-xs text-muted">
              {{ detail.description }}
            </p>
          </div>

          <div class="flex flex-1 items-center justify-center gap-3 px-4">
            <UTabs
              v-model="viewport"
              :items="viewportItems"
              size="sm"
              variant="pill"
              :ui="highContrastTabsUi"
            />
            <div class="inline-flex items-center rounded-lg bg-elevated p-1 mb-2">
              <button
                v-for="item in [{ label: 'Default', value: 'default' }, { label: 'RFM Classic', value: 'rfm-classic' }]"
                :key="item.value"
                type="button"
                class="rounded-md px-3 py-2  text-xs font-medium leading-none transition-colors"
                :class="themeVariant === item.value ? 'bg-inverted text-inverted' : 'text-default hover:bg-muted/60'"
                @click="themeVariant = item.value; renderComponent()"
              >
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="flex flex-1 items-center justify-end gap-2">
            <UBadge v-if="detail" color="neutral" variant="soft" size="sm">
              {{ resolutionLabel }}
            </UBadge>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="loading"
              aria-label="Reload component"
              @click="loadData"
            />
          </div>
        </div>

        <div v-if="loadError" class="border-b border-default px-5 py-2 text-sm text-error md:px-6">
          {{ loadError }}
        </div>
        <div v-if="runtimeError" class="border-b border-default px-5 py-2 text-sm text-error md:px-6">
          {{ runtimeError }}
        </div>

        <div class="min-h-0 flex-1 overflow-auto overflow-x-hidden bg-[#0f172a] p-3 md:p-4">
          <div class="mx-auto flex h-full min-h-full w-full max-w-full items-center justify-center py-1 md:py-2">
            <div
              class="overflow-hidden rounded-xl border border-default bg-default shadow-sm transition-all"
              :style="viewportFrameStyle"
            >
              <iframe
                ref="iframeRef"
                class="h-full w-full border-0 rounded-lg"
                title="Component preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="flex w-[420px] shrink-0 flex-col border-l border-default bg-default">
        <div class="space-y-3 border-b border-default p-4">
          <UFormField label="Available Components">
            <USelect v-model="selectedSlug" :items="availableSlugs" class="w-full" />
          </UFormField>

          <div v-if="detail" class="space-y-1 text-xs text-muted">
            <div>Category: {{ detail.uxCategory || detail.category || 'uncategorized' }}</div>
            <div v-if="detail.version">Version: {{ detail.version }}</div>
            <div v-if="detail.stability">Stability: {{ detail.stability }}</div>
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <UTabs v-model="activeTab" :items="tabItems" class="border-b border-default p-4" :ui="highContrastTabsUi" />

          <div class="min-h-0 flex-1 overflow-auto p-4">
            <div v-if="activeTab === 'form'" class="space-y-4">
              <div v-if="visibleFormFields.length === 0" class="text-sm text-muted">
                No editable form fields are available for this component yet.
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="field in visibleFormFields"
                  :key="field.id"
                  class="space-y-2 rounded-lg border border-default bg-elevated/40 p-3"
                >
                  <div>
                    <div class="text-xs font-semibold text-toned">
                      {{ field.section === 'payload' ? 'Payload' : 'Config' }}
                    </div>
                    <div class="mt-1 text-sm font-medium text-highlighted">
                      {{ field.label }}
                      <span v-if="field.required" class="text-error">*</span>
                    </div>
                    <div v-if="field.description" class="mt-1 text-xs text-muted">
                      {{ field.description }}
                    </div>
                    <div
                      v-if="field.disabled && !isContentCardMediaSrcField(field)"
                      class="mt-1 text-xs text-muted"
                    >
                      Managed from the referenced media/content source.
                    </div>
                  </div>

                  <ComponentsPlaygroundRichTextMediaField
                    v-if="isContentCardBodyField(field) || isVideoDescriptionField(field)"
                    :model-value="String(getFieldValue(field) ?? '')"
                    :placeholder="isVideoDescriptionField(field) ? 'Write video intro or supporting copy...' : 'Write content card content...'"
                    @update:model-value="(value: string) => updateField(field, value)"
                  />

                  <ComponentsPlaygroundMediaImageField
                    v-else-if="isContentCardMediaSrcField(field)"
                    :model-value="String(getFieldValue(field) ?? '')"
                    :alt-text="getContentCardMediaAlt()"
                    @update:model-value="(value: string) => updateContentCardMediaField(['payload', 'media', 'src'], value)"
                    @update:alt-text="(value: string) => updateContentCardMediaField(['payload', 'media', 'alt'], value)"
                  />

                  <UCheckbox
                    v-else-if="getSchemaType(field.schema) === 'boolean'"
                    :model-value="Boolean(getFieldValue(field))"
                    :disabled="field.disabled"
                    @update:model-value="(value: boolean) => updateField(field, value)"
                  />

                  <USelect
                    v-else-if="Array.isArray(field.schema.enum)"
                    :items="field.schema.enum.map((value) => ({ label: humanizeKey(String(value)), value }))"
                    label-key="label"
                    value-key="value"
                    :model-value="getFieldValue(field)"
                    :disabled="field.disabled"
                    variant="soft"
                    size="sm"
                    class="w-full"
                    @update:model-value="(value: unknown) => updateField(field, value)"
                  />

                  <UTextarea
                    v-else-if="field.multiline"
                    :model-value="String(getFieldValue(field) ?? '')"
                    :disabled="field.disabled"
                    :rows="field.section === 'payload' ? 5 : 3"
                    variant="soft"
                    size="sm"
                    class="w-full"
                    @update:model-value="(value: string) => updateField(field, value)"
                  />

                  <UInput
                    v-else
                    :type="getSchemaType(field.schema) === 'number' ? 'number' : 'text'"
                    :model-value="String(getFieldValue(field) ?? '')"
                    :disabled="field.disabled"
                    variant="soft"
                    size="sm"
                    class="w-full"
                    @update:model-value="(value: string) => updateField(field, value)"
                  />
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'metadata'" class="space-y-2 text-sm">
              <div class="flex justify-between gap-2">
                <span class="text-muted">Slug</span>
                <span class="font-medium">{{ detail?.slug }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Label</span>
                <span class="font-medium">{{ detail?.label || 'n/a' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Category</span>
                <span class="font-medium">{{ detail?.category || 'n/a' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">UX Category</span>
                <span class="font-medium">{{ detail?.uxCategory || 'n/a' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Version</span>
                <span class="font-medium">{{ detail?.version || 'n/a' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Stability</span>
                <span class="font-medium">{{ detail?.stability || 'n/a' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Visibility</span>
                <span class="font-medium">{{ detail?.visibility || 'n/a' }}</span>
              </div>
            </div>

            <div v-else-if="activeTab === 'schema'">
              <pre class="overflow-auto rounded border border-default bg-elevated p-3 font-mono text-xs whitespace-pre-wrap">{{ JSON.stringify(detail?.jsonSchema || {}, null, 2) }}</pre>
            </div>

            <div v-else-if="activeTab === 'contract'">
              <pre class="overflow-auto rounded border border-default bg-elevated p-3 font-mono text-xs whitespace-pre-wrap">{{ JSON.stringify(detail?.compiledContract || {}, null, 2) }}</pre>
            </div>

            <div v-else class="space-y-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-highlighted">Accessibility Audit</div>
                  <p class="text-xs text-muted">WCAG 2.2 AA baseline using axe-core against the rendered preview.</p>
                </div>
                <UBadge :color="a11yStatusColor" variant="soft" data-testid="a11y-status-badge">
                  {{ a11yStatusLabel }}
                </UBadge>
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  size="sm"
                  color="primary"
                  :loading="a11yAudit.status === 'running'"
                  data-testid="a11y-run-button"
                  @click="runA11yChecks"
                >
                  Run accessibility check
                </UButton>
                <UButton size="sm" color="neutral" variant="outline" @click="clearA11y">
                  Reset
                </UButton>
              </div>

              <div v-if="a11yAudit.checkedAt" class="text-xs text-muted">
                Last checked: {{ new Date(a11yAudit.checkedAt).toLocaleTimeString() }}
              </div>

              <UAlert
                v-if="a11yAudit.error"
                color="error"
                variant="soft"
                title="Accessibility audit failed"
                :description="a11yAudit.error"
              />

              <div class="flex flex-wrap gap-2">
                <UBadge color="error" variant="soft" data-testid="a11y-count-critical">
                  Critical: {{ a11yAudit.counts.critical }}
                </UBadge>
                <UBadge color="error" variant="soft" data-testid="a11y-count-serious">
                  Serious: {{ a11yAudit.counts.serious }}
                </UBadge>
                <UBadge color="warning" variant="soft" data-testid="a11y-count-moderate">
                  Moderate: {{ a11yAudit.counts.moderate }}
                </UBadge>
                <UBadge color="neutral" variant="soft" data-testid="a11y-count-minor">
                  Minor: {{ a11yAudit.counts.minor }}
                </UBadge>
              </div>

              <UCard>
                <div class="mb-2 text-xs font-semibold text-toned">
                  Violations
                </div>
                <div v-if="!a11yAudit.violations.length" class="text-xs text-muted">
                  No violations recorded for the current run.
                </div>
                <div v-else class="space-y-3">
                  <div
                    v-for="violation in a11yAudit.violations.slice(0, 8)"
                    :key="violation.id"
                    class="rounded border border-default p-3"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-medium text-highlighted">
                        {{ violation.help }}
                      </div>
                      <UBadge :color="violation.impact === 'critical' || violation.impact === 'serious' ? 'error' : 'warning'" variant="soft">
                        {{ violation.impact }}
                      </UBadge>
                    </div>
                    <p class="mt-1 text-xs text-muted">
                      {{ violation.description }}
                    </p>
                    <div class="mt-2 text-xs text-muted">
                      Nodes affected: {{ violation.nodes }}
                    </div>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="mb-2 text-xs font-semibold text-toned">
                  Token contrast matrix
                </div>
                <div class="overflow-hidden rounded border border-default">
                  <table class="min-w-full divide-y divide-default text-xs">
                    <thead class="bg-elevated">
                      <tr>
                        <th class="px-3 py-2 text-left font-medium text-muted">Pair</th>
                        <th class="px-3 py-2 text-left font-medium text-muted">Ratio</th>
                        <th class="px-3 py-2 text-left font-medium text-muted">AA</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr v-for="row in contrastMatrix" :key="row.pair">
                        <td class="px-3 py-2 text-highlighted">{{ row.pair }}</td>
                        <td class="px-3 py-2 text-muted">{{ row.ratio.toFixed(2) }}:1</td>
                        <td class="px-3 py-2">
                          <UBadge :color="row.passesAA ? 'success' : 'error'" variant="soft">
                            {{ row.passesAA ? 'Pass' : 'Fail' }}
                          </UBadge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
