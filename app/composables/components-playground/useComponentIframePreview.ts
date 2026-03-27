import type { Ref } from 'vue'
import { useComponentsRuntime } from './useComponentsRuntime'

export const RFM_PLAYGROUND_MOUNT_SELECTOR = '#rfm-components-playground-mount'

export function resolvePreviewAssetUrl(cdnBaseUrl: string, key: string): string {
  if (/^https?:\/\//i.test(String(key || ''))) {
    return String(key)
  }
  const trimmedBase = String(cdnBaseUrl || '').replace(/\/+$/, '')
  const trimmedKey = String(key || '').replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedKey}`
}

/**
 * Renders RFM component pods inside a sandboxed iframe (same pattern as DetailPage).
 */
export function useComponentIframePreview(iframeRef: Ref<HTMLIFrameElement | null>) {
  const runtime = useComponentsRuntime()
  const runtimeError = ref('')

  async function ensureRuntimeLoaded(): Promise<void> {
    runtimeError.value = ''
    try {
      await runtime.loadRuntime()
    } catch (error: unknown) {
      runtimeError.value = error instanceof Error ? error.message : 'Failed to load runtime bundle.'
      throw error
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

    if (iframeDoc.querySelector(RFM_PLAYGROUND_MOUNT_SELECTOR)) {
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
<meta name="referrer" content="no-referrer">
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

  async function renderPreview(args: {
    slug: string
    props: Record<string, unknown>
    themeVariant?: string
  }): Promise<void> {
    await ensureRuntimeLoaded()
    await prepareIframe()

    const iframeWin = iframeRef.value?.contentWindow as (Window & typeof globalThis) | null
    const iframeRuntime = iframeWin?.__RFM_COMPONENTS_VUE__
    if (!iframeRuntime) {
      throw new Error('Runtime not available inside preview iframe.')
    }

    iframeRuntime.renderPod({
      slug: args.slug,
      mountSelector: RFM_PLAYGROUND_MOUNT_SELECTOR,
      props: args.props,
      themeVariant: args.themeVariant,
    })
  }

  function unmountPreview(): void {
    const iframeWin = iframeRef.value?.contentWindow as (Window & typeof globalThis) | null
    const iframeRuntime = iframeWin?.__RFM_COMPONENTS_VUE__
    if (iframeRuntime) {
      iframeRuntime.unmount({ mountSelector: RFM_PLAYGROUND_MOUNT_SELECTOR })
    }
  }

  return {
    runtime,
    runtimeError,
    ensureRuntimeLoaded,
    prepareIframe,
    renderPreview,
    unmountPreview,
  }
}
