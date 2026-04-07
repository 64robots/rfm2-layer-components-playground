import type {
  ComponentsResolutionPayload,
  ComponentsRuntime,
} from '../../types/components-playground'
import { useComponentsPlaygroundAdapter } from './useComponentsPlaygroundAdapter'

export function useComponentsRuntime() {
  const adapter = useComponentsPlaygroundAdapter()
  const runtime = ref<ComponentsRuntime | null>(null)
  const resolution = ref<ComponentsResolutionPayload | null>(null)

  async function resolveResolution(force = false): Promise<ComponentsResolutionPayload> {
    if (!force && resolution.value) {
      return resolution.value
    }

    resolution.value = await adapter.fetchResolution()
    return resolution.value
  }

  async function loadRuntime(force = false): Promise<ComponentsRuntime> {
    if (!force && runtime.value) {
      return runtime.value
    }

    const resolved = await resolveResolution(force)

    const cssUrl = resolved.bundleCssUrl || resolveAssetUrl(resolved.cdnBaseUrl, resolved.bundleCssKey)
    const runtimeUrl = resolved.vueEsmUrl || resolveAssetUrl(resolved.cdnBaseUrl, resolved.vueEsmKey)

    ensureStyle(cssUrl)
    await ensureRuntimeModule(runtimeUrl)

    if (!window.__RFM_COMPONENTS_VUE__) {
      throw new Error('Components runtime loaded but global API is missing.')
    }

    runtime.value = window.__RFM_COMPONENTS_VUE__
    return runtime.value
  }

  function renderPod(args: {
    slug: string
    mountSelector: string
    props?: Record<string, unknown>
    themeVariant?: string
  }) {
    if (!runtime.value) {
      throw new Error('Components runtime not loaded. Call loadRuntime() first.')
    }

    runtime.value.renderPod(args)
  }

  function updateProps(args: { mountSelector: string, props: Record<string, unknown> }) {
    if (!runtime.value) {
      throw new Error('Components runtime not loaded. Call loadRuntime() first.')
    }

    runtime.value.updateProps(args)
  }

  function unmount(mountSelector: string) {
    if (!runtime.value) {
      return
    }

    runtime.value.unmount({ mountSelector })
  }

  function reset() {
    runtime.value = null
  }

  return {
    runtime,
    resolution,
    resolveResolution,
    loadRuntime,
    renderPod,
    updateProps,
    unmount,
    reset,
  }
}

function resolveAssetUrl(cdnBaseUrl: string, key: string): string {
  if (/^https?:\/\//i.test(String(key || ''))) {
    return String(key)
  }

  const trimmedBase = String(cdnBaseUrl || '').replace(/\/+$/, '')
  const trimmedKey = String(key || '').replace(/^\/+/, '')

  return `${trimmedBase}/${trimmedKey}`
}

function ensureStyle(href: string): void {
  const selector = `link[data-rfm-components-style="${href}"]`
  if (document.head.querySelector(selector)) {
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.rfmComponentsStyle = href
  document.head.appendChild(link)
}

async function ensureRuntimeModule(src: string): Promise<void> {
  const selector = `script[data-rfm-components-runtime="${src}"]`
  if (document.head.querySelector(selector)) {
    await waitForRuntimeGlobal()
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.src = src
    script.dataset.rfmComponentsRuntime = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load runtime module: ${src}`))
    document.head.appendChild(script)
  })

  await waitForRuntimeGlobal()
}

async function waitForRuntimeGlobal(maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (window.__RFM_COMPONENTS_VUE__) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Timed out waiting for window.__RFM_COMPONENTS_VUE__.')
}
