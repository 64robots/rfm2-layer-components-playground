<script setup lang="ts">
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
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

const editorExtensions = [
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: 'https',
  }),
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right', 'justify'],
    defaultAlignment: 'left',
  }),
]

const editorToolbarItems = [
  [
    { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: 'Redo' } },
  ],
  [
    {
      label: 'Text',
      icon: 'i-lucide-type',
      tooltip: { text: 'Text style' },
      items: [[
        { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-pilcrow' },
        { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
        { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
        { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
      ]],
    },
    {
      icon: 'i-lucide-align-left',
      tooltip: { text: 'Text alignment' },
      items: [[
        { kind: 'textAlign', align: 'left', label: 'Align left', icon: 'i-lucide-align-left' },
        { kind: 'textAlign', align: 'center', label: 'Align center', icon: 'i-lucide-align-center' },
        { kind: 'textAlign', align: 'right', label: 'Align right', icon: 'i-lucide-align-right' },
        { kind: 'textAlign', align: 'justify', label: 'Justify', icon: 'i-lucide-align-justify' },
      ]],
    },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Underline' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strikethrough' } },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Inline code' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } },
    { kind: 'blockquote', icon: 'i-lucide-quote', tooltip: { text: 'Block quote' } },
    { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: 'Code block' } },
    { kind: 'horizontalRule', icon: 'i-lucide-minus', tooltip: { text: 'Divider' } },
  ],
  [
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Add or remove link' } },
    { kind: 'clearFormatting', icon: 'i-lucide-remove-formatting', tooltip: { text: 'Clear formatting' } },
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
      :extensions="editorExtensions"
      :editable="!disabled"
      :placeholder="placeholder || 'Write content card content...'"
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
      description="Choose an image to insert into the content card body."
      media-type="image"
      :allowed-media-types="['image']"
      @select="insertImageMarkup"
    />
  </div>
</template>
