<script setup lang="ts">
import type {
  ComponentsCatalogDetailPayload,
  ComponentsCatalogPayload,
  ComponentsCatalogItem,
} from '../../types/components-playground'
import { useComponentsPlaygroundAdapter } from '../../composables/components-playground/useComponentsPlaygroundAdapter'
import { useComponentsRuntime } from '../../composables/components-playground/useComponentsRuntime'

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
type DetailTab = 'form' | 'props' | 'metadata' | 'schema' | 'contract' | 'a11y'

type JsonSchemaProperty = {
  type?: string
  enum?: unknown[]
  title?: string
  description?: string
}

type A11yIssue = {
  rule: string
  message: string
}

const route = useRoute()
const router = useRouter()
const adapter = useComponentsPlaygroundAdapter()
const runtime = useComponentsRuntime()

const mountSelector = '#rfm-components-playground-mount'

const slug = computed(() => String(route.params.slug || '').trim())

const loading = ref(false)
const loadError = ref('')
const runtimeError = ref('')

const catalog = ref<ComponentsCatalogPayload | null>(null)
const detail = ref<ComponentsCatalogDetailPayload | null>(null)

const viewport = ref<ViewportMode>('desktop')
const activeTab = ref<DetailTab>('form')

const propsDraft = ref<Record<string, unknown>>({})
const propsText = ref('{}')
const propsJsonError = ref('')

const a11yStatus = ref<'idle' | 'running' | 'passed' | 'failed' | 'error'>('idle')
const a11yIssues = ref<A11yIssue[]>([])
const a11yCheckedAt = ref<string | null>(null)

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

const tabItems: Array<{ label: string, value: DetailTab }> = [
  { label: 'Form', value: 'form' },
  { label: 'Props', value: 'props' },
  { label: 'Metadata', value: 'metadata' },
  { label: 'Schema', value: 'schema' },
  { label: 'Contract', value: 'contract' },
  { label: 'A11y', value: 'a11y' },
]

const resolutionLabel = computed(() => {
  if (!detail.value) {
    return ''
  }

  return `${detail.value.releaseId || 'unresolved'} (${detail.value.channel})`
})

const viewportClass = computed(() => {
  if (viewport.value === 'mobile') {
    return 'w-[420px] h-[760px]'
  }

  if (viewport.value === 'tablet') {
    return 'w-[900px] h-[980px]'
  }

  return 'w-[1280px] h-[820px]'
})

const formFields = computed(() => {
  const schema = detail.value?.jsonSchema
  const properties = schema && typeof schema === 'object' && !Array.isArray(schema)
    ? (schema.properties as Record<string, JsonSchemaProperty> | undefined)
    : undefined

  if (!properties || typeof properties !== 'object') {
    return []
  }

  const required = Array.isArray(schema.required) ? schema.required : []

  return Object.entries(properties)
    .filter(([, value]) => {
      const type = value?.type
      return type === 'string' || type === 'number' || type === 'boolean' || Array.isArray(value?.enum)
    })
    .map(([key, value]) => ({
      key,
      schema: value || {},
      required: required.includes(key),
    }))
})

function syncPropsTextFromDraft() {
  propsText.value = JSON.stringify(propsDraft.value || {}, null, 2)
  propsJsonError.value = ''
}

function setDraftFromObject(value: Record<string, unknown>) {
  propsDraft.value = JSON.parse(JSON.stringify(value || {}))
  syncPropsTextFromDraft()
}

function updateField(key: string, value: unknown, fieldSchema: JsonSchemaProperty) {
  const next = { ...(propsDraft.value || {}) }

  if (fieldSchema.type === 'number') {
    const n = Number(value)
    next[key] = Number.isNaN(n) ? value : n
  } else if (fieldSchema.type === 'boolean') {
    next[key] = Boolean(value)
  } else {
    next[key] = value
  }

  propsDraft.value = next
  syncPropsTextFromDraft()
  void renderComponent()
}

async function applyPropsJson() {
  propsJsonError.value = ''

  try {
    const parsed = JSON.parse(propsText.value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      propsJsonError.value = 'Props JSON must be an object.'
      return
    }

    propsDraft.value = parsed as Record<string, unknown>
    await renderComponent()
  } catch (error: unknown) {
    propsJsonError.value = error instanceof Error ? error.message : 'Invalid JSON.'
  }
}

function unmountComponent() {
  runtime.unmount(mountSelector)
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

async function renderComponent() {
  if (!detail.value) {
    return
  }

  await ensureRuntimeLoaded()
  runtime.renderPod({
    slug: detail.value.slug,
    mountSelector,
    props: propsDraft.value,
  })
}

function clearA11y() {
  a11yStatus.value = 'idle'
  a11yIssues.value = []
  a11yCheckedAt.value = null
}

function getTextContent(element: Element | null): string {
  if (!element) {
    return ''
  }

  return String(element.textContent || '').trim()
}

async function runA11yChecks() {
  if (a11yStatus.value === 'running') {
    return
  }

  a11yStatus.value = 'running'
  a11yIssues.value = []
  a11yCheckedAt.value = null

  await nextTick()

  const mountEl = document.querySelector(mountSelector)
  if (!mountEl) {
    a11yStatus.value = 'error'
    a11yIssues.value = [{ rule: 'mount', message: 'Preview mount element not found.' }]
    return
  }

  const issues: A11yIssue[] = []

  mountEl.querySelectorAll('img').forEach((img) => {
    if (String(img.getAttribute('alt') || '').trim() === '') {
      issues.push({ rule: 'image-alt', message: 'Image is missing alt text.' })
    }
  })

  mountEl.querySelectorAll('button').forEach((button) => {
    const text = getTextContent(button)
    const ariaLabel = String(button.getAttribute('aria-label') || '').trim()

    if (text === '' && ariaLabel === '') {
      issues.push({ rule: 'button-name', message: 'Button is missing accessible text.' })
    }
  })

  mountEl.querySelectorAll('input,select,textarea').forEach((control) => {
    const id = String(control.getAttribute('id') || '')
    const label = id ? document.querySelector(`label[for="${id}"]`) : null
    const ariaLabel = String(control.getAttribute('aria-label') || '').trim()
    const ariaLabelledBy = String(control.getAttribute('aria-labelledby') || '').trim()

    if (!label && ariaLabel === '' && ariaLabelledBy === '') {
      issues.push({ rule: 'form-label', message: 'Form control is missing label information.' })
    }
  })

  a11yIssues.value = issues
  a11yStatus.value = issues.length > 0 ? 'failed' : 'passed'
  a11yCheckedAt.value = new Date().toISOString()
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
    setDraftFromObject((detailPayload.defaultConfig || {}) as Record<string, unknown>)
    await nextTick()
    await renderComponent()
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load component details.'
  } finally {
    loading.value = false
  }
}

watch(
  () => slug.value,
  async () => {
    unmountComponent()
    clearA11y()
    await loadData()
  },
)

onMounted(async () => {
  await loadData()
})

onBeforeUnmount(() => {
  unmountComponent()
})
</script>

<template>
  <div class="h-full -mx-4 -my-1">
    <div class="flex h-full overflow-hidden">
      <section class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div class="border-b border-default p-4 flex items-center bg-white dark:bg-gray-900">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold">
              {{ detail?.label || slug || 'Component' }}
              <span v-if="detail?.slug" class="text-xs text-muted">({{ detail.slug }})</span>
            </div>
            <p v-if="detail?.description" class="text-xs text-muted mt-1 line-clamp-2">
              {{ detail.description }}
            </p>
          </div>

          <div class="flex-1 flex justify-center">
            <UTabs
              v-model="viewport"
              :items="viewportItems"
              size="sm"
              variant="pill"
            />
          </div>

          <div class="flex-1 flex items-center justify-end gap-2">
            <UBadge v-if="detail" color="neutral" variant="soft" size="sm">{{ resolutionLabel }}</UBadge>
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

        <div v-if="loadError" class="border-b border-default px-4 py-2 text-sm text-error">{{ loadError }}</div>
        <div v-if="runtimeError" class="border-b border-default px-4 py-2 text-sm text-error">{{ runtimeError }}</div>

        <div class="flex-1 min-h-0 overflow-auto bg-[#EFEBE5] dark:bg-default p-4">
          <div class="mx-auto rounded-xl border border-default bg-default p-3 shadow-sm transition-all" :class="viewportClass">
            <div
              id="rfm-components-playground-mount"
              class="h-full min-h-[320px] rounded-lg border border-dashed border-gray-300 bg-white p-4 overflow-auto"
            />
          </div>
        </div>
      </section>

      <section class="w-[420px] border-l border-default flex flex-col bg-white dark:bg-gray-900">
        <div class="border-b border-default p-4 space-y-3">
          <UFormField label="Available Components">
            <USelect v-model="selectedSlug" :items="availableSlugs" class="w-full" />
          </UFormField>

          <div class="text-xs text-muted space-y-1" v-if="detail">
            <div>Category: {{ detail.uxCategory || detail.category || 'uncategorized' }}</div>
            <div v-if="detail.version">Version: {{ detail.version }}</div>
            <div v-if="detail.stability">Stability: {{ detail.stability }}</div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto flex flex-col">
          <UTabs v-model="activeTab" :items="tabItems" class="p-4 border-b border-default" />

          <div class="flex-1 min-h-0 overflow-auto p-4">
            <div v-if="activeTab === 'form'" class="space-y-4">
              <div v-if="formFields.length === 0" class="text-sm text-muted">
                No schema fields available. Use the Props tab to edit raw JSON.
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="field in formFields"
                  :key="field.key"
                  class="flex items-start justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="text-xs font-mono">
                      {{ field.key }}
                      <span v-if="field.required" class="text-error">*</span>
                    </div>
                    <div v-if="field.schema?.description" class="text-xs text-muted line-clamp-2">
                      {{ field.schema.description }}
                    </div>
                  </div>

                  <div class="w-44">
                    <UCheckbox
                      v-if="field.schema?.type === 'boolean'"
                      :model-value="Boolean(propsDraft[field.key])"
                      @update:model-value="(value: boolean) => updateField(field.key, value, field.schema)"
                    />

                    <USelect
                      v-else-if="Array.isArray(field.schema?.enum)"
                      :items="field.schema.enum.map((value) => ({ label: String(value), value }))"
                      label-key="label"
                      value-key="value"
                      :model-value="propsDraft[field.key]"
                      @update:model-value="(value: unknown) => updateField(field.key, value, field.schema)"
                    />

                    <UInput
                      v-else
                      :type="field.schema?.type === 'number' ? 'number' : 'text'"
                      :model-value="String(propsDraft[field.key] ?? '')"
                      @update:model-value="(value: string) => updateField(field.key, value, field.schema)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'props'" class="space-y-3">
              <div class="flex items-center justify-end gap-2">
                <UButton size="xs" variant="soft" color="primary" @click="applyPropsJson">Apply JSON</UButton>
              </div>

              <UFormField label="Props (JSON)">
                <UTextarea v-model="propsText" :rows="18" />
              </UFormField>

              <UAlert
                v-if="propsJsonError"
                color="warning"
                variant="soft"
                title="Invalid JSON"
                :description="propsJsonError"
              />
            </div>

            <div v-else-if="activeTab === 'metadata'" class="space-y-2 text-sm">
              <div class="flex justify-between gap-2"><span class="text-muted">Slug</span><span class="font-medium">{{ detail?.slug }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">Label</span><span class="font-medium">{{ detail?.label || 'n/a' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">Category</span><span class="font-medium">{{ detail?.category || 'n/a' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">UX Category</span><span class="font-medium">{{ detail?.uxCategory || 'n/a' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">Version</span><span class="font-medium">{{ detail?.version || 'n/a' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">Stability</span><span class="font-medium">{{ detail?.stability || 'n/a' }}</span></div>
              <div class="flex justify-between gap-2"><span class="text-muted">Visibility</span><span class="font-medium">{{ detail?.visibility || 'n/a' }}</span></div>
            </div>

            <div v-else-if="activeTab === 'schema'">
              <pre class="text-xs font-mono whitespace-pre-wrap overflow-auto rounded border border-default bg-elevated p-3">{{ JSON.stringify(detail?.jsonSchema || {}, null, 2) }}</pre>
            </div>

            <div v-else-if="activeTab === 'contract'">
              <pre class="text-xs font-mono whitespace-pre-wrap overflow-auto rounded border border-default bg-elevated p-3">{{ JSON.stringify(detail?.compiledContract || {}, null, 2) }}</pre>
            </div>

            <div v-else class="space-y-3">
              <div class="flex items-center gap-2">
                <UButton size="sm" color="primary" :loading="a11yStatus === 'running'" @click="runA11yChecks">Run A11y Checks</UButton>
                <UButton size="sm" color="neutral" variant="outline" @click="clearA11y">Reset</UButton>
                <UBadge color="neutral" variant="soft" size="sm">{{ a11yStatus }}</UBadge>
              </div>

              <div v-if="a11yCheckedAt" class="text-xs text-muted">Last checked: {{ a11yCheckedAt }}</div>

              <div v-if="a11yIssues.length === 0 && ['passed', 'failed', 'error'].includes(a11yStatus)" class="text-sm text-muted">
                {{ a11yStatus === 'passed' ? 'No accessibility issues detected in quick checks.' : 'No detailed issues recorded.' }}
              </div>

              <UCard v-for="(issue, index) in a11yIssues" :key="`${issue.rule}-${index}`">
                <div class="text-sm font-semibold text-error">{{ issue.rule }}</div>
                <p class="text-sm text-muted">{{ issue.message }}</p>
              </UCard>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
