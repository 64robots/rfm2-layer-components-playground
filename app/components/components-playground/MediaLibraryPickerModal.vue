<script setup lang="ts">
import type {
  MediaLibraryItem,
  MediaLibrarySelection,
} from '../../composables/components-playground/useMediaLibrary'
import { useComponentsPlaygroundMediaLibrary } from '../../composables/components-playground/useMediaLibrary'

const props = defineProps<{
  open: boolean
  title?: string
  description?: string
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

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      searchQuery.value = ''
      items.value = []
      loadError.value = ''
      selectionInFlightId.value = null
      if (searchDebounceId.value) {
        clearTimeout(searchDebounceId.value)
        searchDebounceId.value = null
      }
      return
    }

    void loadItems()
  },
)

watch(searchQuery, () => {
  if (!props.open) {
    return
  }

  if (searchDebounceId.value) {
    clearTimeout(searchDebounceId.value)
  }

  searchDebounceId.value = setTimeout(() => {
    void loadItems()
  }, 250)
})

async function loadItems(): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    items.value = await mediaLibrary.searchImages(searchQuery.value)
  } catch (error) {
    items.value = []
    loadError.value = error instanceof Error
      ? error.message
      : 'Unable to load media library images.'
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
  return item.originalName || item.name || 'Untitled image'
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="title || 'Select media'"
    :description="description || 'Choose an image from the media library.'"
    size="2xl"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-3">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search media images"
          class="w-full"
        />

        <UAlert
          v-if="loadError"
          color="error"
          variant="soft"
          title="Media library unavailable"
          :description="loadError"
        />

        <div v-if="loading" class="text-sm text-muted">
          Loading images...
        </div>

        <div v-else-if="!items.length" class="text-sm text-muted">
          No images found.
        </div>

        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="overflow-hidden rounded-md border border-default text-left transition hover:shadow-sm disabled:cursor-wait disabled:opacity-70"
            :disabled="selectionInFlightId === item.id"
            @click="selectItem(item)"
          >
            <div class="aspect-square overflow-hidden bg-muted/40">
              <img
                v-if="item.url"
                :src="item.url"
                :alt="item.altText || resolveItemLabel(item)"
                class="h-full w-full object-cover"
              >
              <div v-else class="flex h-full items-center justify-center px-3 text-center text-xs text-muted">
                Preview unavailable
              </div>
            </div>

            <div class="space-y-1 p-2">
              <p class="truncate text-xs font-medium text-highlighted">
                {{ resolveItemLabel(item) }}
              </p>
              <p class="truncate text-[11px] text-muted">
                {{ item.mime || 'image' }}
              </p>
            </div>
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton label="Close" color="neutral" variant="outline" @click="openModel = false" />
    </template>
  </UModal>
</template>
