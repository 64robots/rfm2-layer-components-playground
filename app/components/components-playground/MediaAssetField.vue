<script setup lang="ts">
import type { MediaLibrarySelection } from '../../composables/components-playground/useMediaLibrary'

type MediaAssetSourceMode = 'external' | 'library'

type ExternalMediaAsset = {
  source: 'external'
  url: string
  mimeType?: string
  title?: string
  alt?: string
}

type LibraryMediaAsset = {
  source: 'library'
  media: {
    id: string
    url?: string | null
    downloadUrl?: string
    name?: string
    originalName?: string
    mime?: string
    mediaType?: string
    altText?: string
    width?: number
    height?: number
  }
}

type MediaAssetValue = ExternalMediaAsset | LibraryMediaAsset

const props = defineProps<{
  modelValue?: unknown
  disabled?: boolean
  mediaType?: string
  title?: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: MediaAssetValue): void
}>()

const mediaPickerOpen = ref(false)

function createExternalAsset(overrides: Partial<ExternalMediaAsset> = {}): ExternalMediaAsset {
  return {
    source: 'external',
    url: '',
    mimeType: '',
    title: '',
    alt: '',
    ...overrides,
  }
}

function createLibraryAsset(overrides: Partial<LibraryMediaAsset['media']> = {}): LibraryMediaAsset {
  return {
    source: 'library',
    media: {
      id: '',
      url: '',
      downloadUrl: '',
      name: '',
      originalName: '',
      mime: '',
      mediaType: props.mediaType || 'document',
      altText: '',
      ...overrides,
    },
  }
}

function normalizeValue(value: unknown): MediaAssetValue {
  if (typeof value === 'string' && value.trim()) {
    return createExternalAsset({ url: value.trim(), title: props.title || '' })
  }

  if (!value || typeof value !== 'object') {
    return createExternalAsset({ title: props.title || '' })
  }

  const item = value as Record<string, any>

  if (item.source === 'library' && item.media && typeof item.media === 'object') {
    return createLibraryAsset(item.media)
  }

  if (item.source === 'external') {
    return createExternalAsset({
      url: typeof item.url === 'string' ? item.url : '',
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : '',
      title: typeof item.title === 'string' ? item.title : (props.title || ''),
      alt: typeof item.alt === 'string' ? item.alt : '',
    })
  }

  if (typeof item.id === 'string' && item.id.trim()) {
    return createLibraryAsset(item)
  }

  const legacyUrl = typeof item.url === 'string'
    ? item.url
    : typeof item.src === 'string'
      ? item.src
      : typeof item.pdf === 'string'
        ? item.pdf
        : ''

  if (legacyUrl) {
    return createExternalAsset({
      url: legacyUrl,
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : '',
      title: typeof item.title === 'string' ? item.title : (props.title || ''),
      alt: typeof item.alt === 'string' ? item.alt : '',
    })
  }

  return createExternalAsset({ title: props.title || '' })
}

const normalizedValue = computed<MediaAssetValue>(() => normalizeValue(props.modelValue))

const selectedSource = computed<MediaAssetSourceMode>({
  get: () => normalizedValue.value.source,
  set: (value) => {
    if (value === 'library') {
      const current = normalizedValue.value
      if (current.source === 'library') {
        emit('update:modelValue', current)
        return
      }

      emit('update:modelValue', createLibraryAsset({
        downloadUrl: current.url,
        mime: current.mimeType,
        name: current.title,
        altText: current.alt,
      }))
      return
    }

    const current = normalizedValue.value
    if (current.source === 'external') {
      emit('update:modelValue', current)
      return
    }

    emit('update:modelValue', createExternalAsset({
      url: current.media.downloadUrl || current.media.url || '',
      mimeType: current.media.mime || '',
      title: current.media.originalName || current.media.name || props.title || '',
      alt: current.media.altText || '',
    }))
  },
})

const selectedLibraryAsset = computed(() => (
  normalizedValue.value.source === 'library' ? normalizedValue.value.media : null
))

const hasSelectedLibraryMedia = computed(() => Boolean(
  selectedLibraryAsset.value?.id
  || selectedLibraryAsset.value?.downloadUrl
  || selectedLibraryAsset.value?.url,
))

function updateExternalField(field: keyof ExternalMediaAsset, value: string): void {
  const current = normalizedValue.value.source === 'external'
    ? normalizedValue.value
    : createExternalAsset()

  emit('update:modelValue', {
    ...current,
    [field]: value,
  })
}

function updateLibraryField(field: keyof LibraryMediaAsset['media'], value: string): void {
  const current = normalizedValue.value.source === 'library'
    ? normalizedValue.value
    : createLibraryAsset()

  emit('update:modelValue', {
    source: 'library',
    media: {
      ...current.media,
      [field]: value,
    },
  })
}

function applySelection(selection: MediaLibrarySelection): void {
  emit('update:modelValue', {
    source: 'library',
    media: {
      id: selection.item.id,
      url: selection.item.url,
      downloadUrl: selection.url,
      name: selection.item.name,
      originalName: selection.item.originalName,
      mime: selection.item.mime,
      mediaType: selection.item.mediaType || props.mediaType || 'document',
      altText: selection.item.altText,
      width: selection.item.width,
      height: selection.item.height,
    },
  })
}

function clearLibrarySelection(): void {
  emit('update:modelValue', createLibraryAsset())
}

function resolveLibraryLabel(): string {
  return selectedLibraryAsset.value?.originalName
    || selectedLibraryAsset.value?.name
    || 'Selected media object'
}

function resolveLibraryTypeLabel(): string {
  const type = selectedLibraryAsset.value?.mediaType || props.mediaType || 'document'
  if (type === 'image') return 'Image'
  if (type === 'video') return 'Video'
  return 'Document'
}

function resolveLibraryIcon(): string {
  const type = selectedLibraryAsset.value?.mediaType || props.mediaType || 'document'
  if (type === 'image') return 'i-lucide-image'
  if (type === 'video') return 'i-lucide-clapperboard'
  return 'i-lucide-file-text'
}

function hasImagePreview(): boolean {
  return resolveLibraryTypeLabel() === 'Image' && Boolean(selectedLibraryAsset.value?.url || selectedLibraryAsset.value?.downloadUrl)
}

function hasVideoPreview(): boolean {
  return resolveLibraryTypeLabel() === 'Video' && Boolean(selectedLibraryAsset.value?.url || selectedLibraryAsset.value?.downloadUrl)
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-2">
      <UButton
        size="sm"
        color="neutral"
        :variant="selectedSource === 'external' ? 'solid' : 'outline'"
        :disabled="disabled"
        class="w-full"
        @click="selectedSource = 'external'"
      >
        External URL
      </UButton>

      <UButton
        size="sm"
        color="neutral"
        :variant="selectedSource === 'library' ? 'solid' : 'outline'"
        :disabled="disabled"
        class="w-full"
        @click="selectedSource = 'library'"
      >
        Media Object
      </UButton>
    </div>

    <p class="text-xs text-muted">
      Choose a direct file URL or attach a file from the media library.
    </p>

    <template v-if="selectedSource === 'external'">
      <UFormField label="URL">
        <UInput
          :model-value="normalizedValue.source === 'external' ? normalizedValue.url : ''"
          :disabled="disabled"
          size="sm"
          variant="soft"
          class="w-full"
          @update:model-value="(value: string) => updateExternalField('url', value)"
        />
      </UFormField>

      <UFormField label="MIME Type">
        <UInput
          :model-value="normalizedValue.source === 'external' ? (normalizedValue.mimeType || '') : ''"
          :disabled="disabled"
          size="sm"
          variant="soft"
          class="w-full"
          @update:model-value="(value: string) => updateExternalField('mimeType', value)"
        />
      </UFormField>

      <UFormField v-if="mediaType === 'image'" label="Alt Text">
        <UInput
          :model-value="normalizedValue.source === 'external' ? (normalizedValue.alt || '') : ''"
          :disabled="disabled"
          size="sm"
          variant="soft"
          class="w-full"
          @update:model-value="(value: string) => updateExternalField('alt', value)"
        />
      </UFormField>
    </template>

    <template v-else>
      <div
        v-if="hasSelectedLibraryMedia"
        class="overflow-hidden rounded-xl border border-default bg-default"
      >
        <div class="aspect-[16/10] overflow-hidden bg-muted/30">
          <img
            v-if="hasImagePreview()"
            :src="selectedLibraryAsset?.url || selectedLibraryAsset?.downloadUrl || undefined"
            :alt="selectedLibraryAsset?.altText || resolveLibraryLabel()"
            class="h-full w-full object-cover"
          >
          <video
            v-else-if="hasVideoPreview()"
            :src="selectedLibraryAsset?.url || selectedLibraryAsset?.downloadUrl || undefined"
            class="h-full w-full object-cover"
            muted
            playsinline
            preload="metadata"
          />
          <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <UIcon :name="resolveLibraryIcon()" class="h-10 w-10 text-muted" />
            <p class="text-sm text-muted">
              {{ resolveLibraryTypeLabel() }} selected
            </p>
          </div>
        </div>

        <div class="space-y-3 p-4">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-highlighted">
              {{ resolveLibraryLabel() }}
            </p>
            <p class="text-xs text-muted">
              {{ resolveLibraryTypeLabel() }}{{ selectedLibraryAsset?.mime ? ` • ${selectedLibraryAsset.mime}` : '' }}
            </p>
            <p class="truncate text-[11px] text-muted">
              {{ selectedLibraryAsset?.id }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-images"
              :disabled="disabled"
              @click="mediaPickerOpen = true"
            >
              Change file
            </UButton>

            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              :disabled="disabled"
              @click="clearLibrarySelection"
            >
              Clear
            </UButton>
          </div>
        </div>
      </div>

      <div v-else class="space-y-3 rounded-xl border border-dashed border-default bg-muted/10 p-4">
        <p class="text-sm text-muted">
          No media object selected yet.
        </p>

        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-images"
          :disabled="disabled"
          @click="mediaPickerOpen = true"
        >
          Browse media library
        </UButton>
      </div>

      <UFormField v-if="mediaType === 'image'" label="Alt Text">
        <UInput
          :model-value="selectedLibraryAsset?.altText || ''"
          :disabled="disabled"
          size="sm"
          variant="soft"
          class="w-full"
          @update:model-value="(value: string) => updateLibraryField('altText', value)"
        />
      </UFormField>
    </template>

    <ComponentsPlaygroundMediaLibraryPickerModal
      v-model:open="mediaPickerOpen"
      :media-type="props.mediaType === 'image' || props.mediaType === 'video' || props.mediaType === 'document' ? props.mediaType : 'all'"
      :title="title ? `Select ${title}` : 'Select media'"
      description="Choose a file from the media library."
      @select="applySelection"
    />
  </div>
</template>
