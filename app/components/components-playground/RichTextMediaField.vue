<script setup lang="ts">
import type { MediaLibrarySelection } from '../../composables/components-playground/useMediaLibrary'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const editorRef = ref<{ editor?: unknown } | null>(null)
const mediaPickerOpen = ref(false)

const editorToolbarItems = [
  [
    { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: 'Redo' } },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Underline' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strikethrough' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } },
  ],
]

const model = computed({
  get: () => props.modelValue || '',
  set: (value: string) => emit('update:modelValue', value),
})

function resolveEditor(): any {
  const exposedEditor = editorRef.value?.editor as { value?: unknown } | unknown
  if (exposedEditor && typeof exposedEditor === 'object' && 'value' in (exposedEditor as Record<string, unknown>)) {
    return (exposedEditor as { value?: unknown }).value
  }

  return exposedEditor
}

function openMediaPicker(): void {
  if (props.disabled) {
    return
  }

  mediaPickerOpen.value = true
}

function insertImageMarkup(selection: MediaLibrarySelection): void {
  const editor = resolveEditor()
  const alt = selection.item.altText || selection.item.originalName || selection.item.name || ''

  if (editor?.chain) {
    editor.chain().focus().setImage({
      src: selection.url,
      alt,
      title: selection.item.originalName || selection.item.name || undefined,
    }).run()
    return
  }

  const escapedUrl = escapeHtmlAttribute(selection.url)
  const escapedAlt = escapeHtmlAttribute(alt)
  const nextValue = model.value.trim()
  const spacer = nextValue ? '\n' : ''
  model.value = `${nextValue}${spacer}<p><img src="${escapedUrl}" alt="${escapedAlt}"></p>`
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
</script>

<template>
  <div class="space-y-3">
    <UEditor
      ref="editorRef"
      v-model="model"
      content-type="html"
      :editable="!disabled"
      :placeholder="placeholder || 'Write intro card content...'"
      class="w-full"
      :ui="{
        base: 'min-h-0',
        content: 'min-h-44 rounded-md border border-default bg-default px-3 py-2',
      }"
    >
      <template #default="{ editor }">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <UEditorToolbar
            :editor="editor"
            :items="editorToolbarItems"
            layout="fixed"
            size="xs"
            variant="soft"
            class="rounded-md border border-default bg-default p-1"
          />

          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-images"
            :disabled="disabled"
            @click="openMediaPicker"
          >
            Insert from media library
          </UButton>
        </div>
      </template>
    </UEditor>

    <p class="text-xs text-muted">
      Rich text is saved as HTML and inline images are pulled from the media library.
    </p>

    <ComponentsPlaygroundMediaLibraryPickerModal
      v-model:open="mediaPickerOpen"
      title="Insert image from media library"
      description="Choose an image to insert into the intro card body."
      @select="insertImageMarkup"
    />
  </div>
</template>
