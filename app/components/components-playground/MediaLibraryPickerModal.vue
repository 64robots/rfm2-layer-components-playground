<script setup lang="ts">
import type {
  MediaLibraryItem,
  MediaLibrarySelection,
  MediaLibraryType,
} from '../../composables/components-playground/useMediaLibrary'
import { useComponentsPlaygroundMediaLibrary } from '../../composables/components-playground/useMediaLibrary'

type ConcreteMediaType = Exclude<MediaLibraryType, 'all'>

const ALL_MEDIA_TYPES: ConcreteMediaType[] = ['image', 'video', 'document']

const props = defineProps<{
  open: boolean
  title?: string
  description?: string
  mediaType?: MediaLibraryType
  allowedMediaTypes?: ConcreteMediaType[]
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'select', payload: MediaLibrarySelection): void
}>()

const mediaLibrary = useComponentsPlaygroundMediaLibrary()

const searchQuery = ref('')
const loading = ref(false)
const selectionInFlightId = ref<string | null>(null)
const items = ref<MediaLibraryItem[]>([])
const loadError = ref('')
const searchDebounceId = ref<ReturnType<typeof setTimeout> | null>(null)
const activeFilter = ref<MediaLibraryType>('all')

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const resolvedAllowedMediaTypes = computed<ConcreteMediaType[]>(() => {
  const next = Array.isArray(props.allowedMediaTypes)
    ? props.allowedMediaTypes.filter((value): value is ConcreteMediaType => ALL_MEDIA_TYPES.includes(value))
    : []

  return next.length ? Array.from(new Set(next)) : [...ALL_MEDIA_TYPES]
})

const availableFilters = computed<Array<{ label: string, value: MediaLibraryType }>>(() => {
  const next: Array<{ label: string, value: MediaLibraryType }> = []

  if (resolvedAllowedMediaTypes.value.length > 1) {
    next.push({ label: 'All Files', value: 'all' })
  }

  resolvedAllowedMediaTypes.value.forEach((type) => {
    next.push({
      label: type === 'image'
        ? 'Images'
        : type === 'video'
          ? 'Videos'
          : 'Documents',
      value: type,
    })
  })

  return next
})

const filterDescription = computed(() => {
  if (activeFilter.value === 'all') {
    return 'Showing every supported media type.'
  }

  if (activeFilter.value === 'image') return 'Showing image files.'
  if (activeFilter.value === 'video') return 'Showing video files.'
  return 'Showing document files.'
})

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      searchQuery.value = ''
      items.value = []
      loadError.value = ''
      selectionInFlightId.value = null
      activeFilter.value = resolveInitialFilter()
      if (searchDebounceId.value) {
        clearTimeout(searchDebounceId.value)
        searchDebounceId.value = null
      }
      return
    }

    activeFilter.value = resolveInitialFilter()
    void loadItems()
  },
)

watch(
  () => [searchQuery.value, activeFilter.value, resolvedAllowedMediaTypes.value.join(',')],
  () => {
    if (!props.open) {
      return
    }

    if (searchDebounceId.value) {
      clearTimeout(searchDebounceId.value)
    }

    searchDebounceId.value = setTimeout(() => {
      void loadItems()
    }, 200)
  },
)

function resolveInitialFilter(): MediaLibraryType {
  const preferred = props.mediaType
  if (preferred === 'all' && resolvedAllowedMediaTypes.value.length > 1) {
    return 'all'
  }

  if (preferred && preferred !== 'all' && resolvedAllowedMediaTypes.value.includes(preferred)) {
    return preferred
  }

  if (resolvedAllowedMediaTypes.value.length === 1) {
    return resolvedAllowedMediaTypes.value[0]
  }

  return 'all'
}

async function loadItems(): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    items.value = await mediaLibrary.searchMedia(activeFilter.value, searchQuery.value)
  } catch (error) {
    items.value = []
    loadError.value = error instanceof Error
      ? error.message
      : 'Unable to load media library items.'
  } finally {
    loading.value = false
  }
}

async function selectItem(item: MediaLibraryItem): Promise<void> {
  selectionInFlightId.value = item.id

  try {
    const url = await mediaLibrary.resolveMediaUrl(item)
    emit('select', {
      item,
      url,
    })
    openModel.value = false
  } catch (error) {
    loadError.value = error instanceof Error
      ? error.message
      : 'Unable to use the selected media item.'
  } finally {
    selectionInFlightId.value = null
  }
}

function resolveItemLabel(item: MediaLibraryItem): string {
  return item.originalName || item.name || 'Untitled media'
}

function resolveItemType(item: MediaLibraryItem): ConcreteMediaType {
  return item.mediaType === 'video' || item.mediaType === 'document' ? item.mediaType : 'image'
}

function resolveItemIcon(item: MediaLibraryItem): string {
  const type = resolveItemType(item)
  if (type === 'video') return 'i-lucide-clapperboard'
  if (type === 'document') return 'i-lucide-file-text'
  return 'i-lucide-image'
}

function resolveItemTypeLabel(item: MediaLibraryItem): string {
  const type = resolveItemType(item)
  if (type === 'video') return 'Video'
  if (type === 'document') return 'Document'
  return 'Image'
}

function resolveItemMeta(item: MediaLibraryItem): string {
  const parts = [
    resolveItemTypeLabel(item),
    item.mime || '',
  ].filter(Boolean)

  return parts.join(' • ')
}

function hasPreview(item: MediaLibraryItem): boolean {
  return Boolean(item.url)
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="title || 'Browse media library'"
    :description="description || 'Choose a file from the media library.'"
    size="5xl"
    :ui="{
      content: 'sm:max-w-[min(96vw,88rem)]',
      body: 'p-0',
      footer: 'justify-between',
    }"
  >
    <template #body>
      <div class="space-y-4 p-4 sm:p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search files by name"
            class="w-full lg:max-w-md"
          />

          <div
            v-if="availableFilters.length > 1"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-for="filter in availableFilters"
              :key="filter.value"
              size="sm"
              color="neutral"
              :variant="activeFilter === filter.value ? 'solid' : 'outline'"
              @click="activeFilter = filter.value"
            >
              {{ filter.label }}
            </UButton>
          </div>
        </div>

        <p class="text-xs text-muted">
          {{ filterDescription }}
        </p>

        <UAlert
          v-if="loadError"
          color="error"
          variant="soft"
          title="Media library unavailable"
          :description="loadError"
        />

        <div v-if="loading" class="rounded-xl border border-default bg-muted/10 p-8 text-sm text-muted">
          Loading media files...
        </div>

        <div v-else-if="!items.length" class="rounded-xl border border-dashed border-default bg-muted/10 p-8 text-sm text-muted">
          No matching files found for this filter.
        </div>

        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="overflow-hidden rounded-xl border border-default bg-default text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            :disabled="selectionInFlightId === item.id"
            @click="selectItem(item)"
          >
            <div class="aspect-[16/10] overflow-hidden bg-muted/30">
              <img
                v-if="resolveItemType(item) === 'image' && hasPreview(item)"
                :src="item.url || undefined"
                :alt="item.altText || resolveItemLabel(item)"
                class="h-full w-full object-cover"
              >
              <video
                v-else-if="resolveItemType(item) === 'video' && hasPreview(item)"
                :src="item.url || undefined"
                class="h-full w-full object-cover"
                muted
                playsinline
                preload="metadata"
              />
              <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <UIcon :name="resolveItemIcon(item)" class="h-10 w-10 text-muted" />
                <p class="text-sm text-muted">
                  {{ resolveItemTypeLabel(item) }} preview unavailable
                </p>
              </div>
            </div>

            <div class="space-y-3 p-4">
              <div class="space-y-1">
                <p class="line-clamp-2 text-sm font-semibold text-highlighted">
                  {{ resolveItemLabel(item) }}
                </p>
                <p class="text-xs text-muted">
                  {{ resolveItemMeta(item) }}
                </p>
              </div>

              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-[11px] text-muted">
                  {{ item.id }}
                </span>
                <span class="text-xs font-medium text-primary">
                  Use file
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <p class="text-xs text-muted">
        Select a file to attach it to this field.
      </p>

      <UButton label="Close" color="neutral" variant="outline" @click="openModel = false" />
    </template>
  </UModal>
</template>
