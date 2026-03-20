<script setup lang="ts">
import type { MediaLibrarySelection } from '../../composables/components-playground/useMediaLibrary'

const props = defineProps<{
  modelValue?: string
  altText?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:altText', value: string): void
}>()

const mediaPickerOpen = ref(false)

const imageUrl = computed({
  get: () => props.modelValue || '',
  set: (value: string) => emit('update:modelValue', value),
})

const imageAlt = computed({
  get: () => props.altText || '',
  set: (value: string) => emit('update:altText', value),
})

function applySelection(selection: MediaLibrarySelection): void {
  imageUrl.value = selection.url
  imageAlt.value = selection.item.altText || selection.item.originalName || selection.item.name || ''
}

function clearSelection(): void {
  imageUrl.value = ''
  imageAlt.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="imageUrl"
      class="overflow-hidden rounded-md border border-default bg-muted/20"
    >
      <div class="aspect-[16/9] overflow-hidden bg-muted/40">
        <img
          :src="imageUrl"
          :alt="imageAlt || 'Selected intro card image'"
          class="h-full w-full object-cover"
        >
      </div>

      <div class="space-y-3 p-3">
        <div class="flex flex-wrap gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-images"
            :disabled="disabled"
            @click="mediaPickerOpen = true"
          >
            Replace image
          </UButton>

          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="disabled"
            @click="clearSelection"
          >
            Remove
          </UButton>
        </div>

        <UFormField label="Alt text">
          <UInput
            v-model="imageAlt"
            :disabled="disabled"
            size="sm"
            variant="soft"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <div v-else class="space-y-2 rounded-md border border-dashed border-default bg-muted/10 p-4">
      <p class="text-sm text-muted">
        No image selected yet.
      </p>

      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-images"
        :disabled="disabled"
        @click="mediaPickerOpen = true"
      >
        Select from media library
      </UButton>
    </div>

    <ComponentsPlaygroundMediaLibraryPickerModal
      v-model:open="mediaPickerOpen"
      title="Select intro card image"
      description="Choose the hero image for this intro card."
      @select="applySelection"
    />
  </div>
</template>
