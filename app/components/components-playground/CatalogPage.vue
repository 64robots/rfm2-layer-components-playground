<script setup lang="ts">
import type { ComponentsCatalogItem, ComponentsCatalogPayload } from '../../types/components-playground'
import { useComponentsPlaygroundAdapter } from '../../composables/components-playground/useComponentsPlaygroundAdapter'

const adapter = useComponentsPlaygroundAdapter()

const loading = ref(false)
const loadError = ref('')
const catalog = ref<ComponentsCatalogPayload | null>(null)
const search = ref('')
const failedPreviewSlugs = ref(new Set<string>())

const certificationEnvironments = computed(() => {
  const environments = catalog.value?.certification?.environments

  if (!environments) {
    return []
  }

  return (['local', 'test', 'staging', 'production'] as const).map(environment => ({
    environment,
    ...environments[environment],
  }))
})

const uxCategoryLabels: Record<string, string> = {
  interactive: 'Interactive',
  display: 'Display',
  workflow: 'Workflow',
  infrastructure: 'Infrastructure',
  uncategorized: 'Uncategorized',
}

const categoryOrder = ['interactive', 'display', 'workflow', 'infrastructure', 'uncategorized']

const filteredComponents = computed<ComponentsCatalogItem[]>(() => {
  const items = catalog.value?.components || []
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return items
  }

  return items.filter((item) => {
    const values = [
      item.slug,
      item.label,
      item.description,
      item.category,
      item.uxCategory,
    ].filter((value): value is string => typeof value === 'string' && value.trim() !== '')

    return values.some((value) => value.toLowerCase().includes(query))
  })
})

const groupedComponents = computed(() => {
  const groups = new Map<string, ComponentsCatalogItem[]>()

  for (const item of filteredComponents.value) {
    const category = (item.uxCategory || item.category || 'uncategorized').trim().toLowerCase()

    if (!groups.has(category)) {
      groups.set(category, [])
    }

    groups.get(category)!.push(item)
  }

  return Array.from(groups.entries())
    .map(([category, items]) => [
      category,
      [...items].sort((a, b) => a.slug.localeCompare(b.slug)),
    ] as const)
    .sort(([a], [b]) => {
      const aIndex = categoryOrder.indexOf(a)
      const bIndex = categoryOrder.indexOf(b)

      if (aIndex === -1 && bIndex === -1) {
        return a.localeCompare(b)
      }

      if (aIndex === -1) {
        return 1
      }

      if (bIndex === -1) {
        return -1
      }

      return aIndex - bIndex
    })
})

async function loadCatalog() {
  loading.value = true
  loadError.value = ''
  failedPreviewSlugs.value = new Set()

  try {
    catalog.value = await adapter.fetchCatalog()
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load components catalog.'
  } finally {
    loading.value = false
  }
}

function markPreviewFailed(slug: string) {
  failedPreviewSlugs.value = new Set([...failedPreviewSlugs.value, slug])
}

onMounted(async () => {
  await loadCatalog()
})
</script>

<template>
  <div class="flex flex-col space-y-4">
    <div class="flex items-start justify-end">
      <div class="flex items-center gap-2 pt-2.5">
        <UInput
          v-model="search"
          placeholder="Search components"
          icon="i-lucide-search"
          class="w-72"
        />

        <UButton color="neutral" variant="soft" :loading="loading" @click="loadCatalog">
          Reload
        </UButton>
      </div>
    </div>

    <UCard class="bg-default">
      <template v-if="catalog?.certification" #header>
        <div class="space-y-4" data-testid="component-release-certification">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Release certification</p>
              <h2 class="mt-1 text-lg font-semibold">{{ catalog.releaseId }}</h2>
              <p class="mt-1 text-xs text-muted">
                Contract v{{ catalog.certification.contract_version || 'unknown' }} ·
                {{ catalog.certification.required_scenario_count }} required scenarios
              </p>
            </div>
            <code
              class="max-w-full break-all rounded-md bg-muted px-3 py-2 text-[11px] text-muted"
              data-testid="component-contract-checksum"
            >{{ catalog.certification.contract_checksum }}</code>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="environment in certificationEnvironments"
              :key="environment.environment"
              :data-testid="`component-certification-${environment.environment}`"
              class="rounded-lg border border-default bg-elevated/50 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold capitalize">{{ environment.environment }}</span>
                <UBadge
                  :color="environment.status === 'certified' ? 'success' : 'warning'"
                  variant="soft"
                  size="sm"
                >
                  {{ environment.status === 'certified' ? 'Certified' : 'Not certified' }}
                </UBadge>
              </div>
              <p class="mt-2 text-sm font-semibold text-highlighted">
                {{ environment.passed }} / {{ environment.required }} passed
              </p>
              <p v-if="environment.failed || environment.missing" class="mt-1 text-[11px] text-muted">
                {{ environment.failed }} failed · {{ environment.missing }} missing
              </p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="catalog" #header>
        <div data-testid="component-release-certification-unavailable">
          <p class="text-sm font-semibold">Certification unavailable</p>
          <p class="mt-1 text-xs text-muted">This resolved release does not include an immutable acceptance contract.</p>
        </div>
      </template>

      <div v-if="catalog" class="mb-6 flex items-center justify-between gap-2 border-b border-default pb-4">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold">Components</h2>
          <p class="text-xs text-muted">Browse runtime-resolved component catalog by category.</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge color="neutral" variant="soft" size="sm">{{ catalog.channel }}</UBadge>
          <UBadge color="neutral" variant="subtle" size="sm">{{ catalog.releaseId || 'unresolved' }}</UBadge>
        </div>
      </div>

      <div v-if="loading" class="text-sm text-muted">Loading component library…</div>
      <div v-else-if="loadError" class="text-sm text-error">{{ loadError }}</div>
      <div v-else-if="groupedComponents.length === 0" class="text-sm text-muted">
        No components found. Try a different search.
      </div>

      <div v-else class="space-y-8">
        <section v-for="[category, items] in groupedComponents" :key="category" class="space-y-4">
          <div class="border-b border-default pb-2">
            <h3 class="text-xl font-semibold">
              {{ uxCategoryLabels[category] || category }}
            </h3>
            <p class="mt-1 text-xs text-muted">
              {{ items.length }} component{{ items.length === 1 ? '' : 's' }}
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <NuxtLink
              v-for="item in items"
              :key="item.slug"
              :to="`/components/${item.slug}`"
              :data-testid="`catalog-card-${item.slug}`"
              class="group block border border-default rounded-lg overflow-hidden bg-elevated transition hover:shadow-sm"
            >
              <div class="aspect-[3/2] bg-muted overflow-hidden">
                <img
                  v-if="item.previewImageUrl && !failedPreviewSlugs.has(item.slug)"
                  :src="item.previewImageUrl"
                  :alt="`${item.label || item.slug} preview`"
                  :data-testid="`catalog-preview-image-${item.slug}`"
                  class="h-full w-full object-cover object-top"
                  loading="lazy"
                  decoding="async"
                  @error="markPreviewFailed(item.slug)"
                >
                <div
                  v-else
                  :data-testid="`catalog-preview-fallback-${item.slug}`"
                  class="h-full w-full flex items-center justify-center text-xs text-muted"
                >
                  {{ item.label || item.slug }}
                </div>
              </div>

              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {{ item.label || item.slug }}
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <UBadge
                      v-if="item.uxCategory || item.category"
                      color="info"
                      variant="soft"
                      size="sm"
                      class="capitalize"
                    >
                      {{ item.uxCategory || item.category }}
                    </UBadge>

                    <span v-if="item.version" class="text-[10px] text-muted font-mono">v{{ item.version }}</span>
                  </div>
                </div>

                <div v-if="item.description" class="text-xs text-muted line-clamp-2">
                  {{ item.description }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>
      </div>
    </UCard>
  </div>
</template>
