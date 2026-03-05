import type {
  ComponentsCatalogDetailPayload,
  ComponentsCatalogPayload,
  ComponentsPlaygroundHostAdapter,
  ComponentsResolutionPayload,
} from '../../types/components-playground'

type ApiEnvelope<T> = {
  success?: boolean
  isSuccess?: boolean
  data?: T
  message?: string
}

export function useComponentsPlaygroundAdapter(): ComponentsPlaygroundHostAdapter {
  const nuxtApp = useNuxtApp()
  const injectedAdapter = nuxtApp.$componentsPlaygroundAdapter as ComponentsPlaygroundHostAdapter | undefined

  if (injectedAdapter) {
    return injectedAdapter
  }

  return {
    fetchCatalog: async () => await fetchPayload<ComponentsCatalogPayload>('/api/components/catalog'),
    fetchCatalogDetail: async (slug: string) => await fetchPayload<ComponentsCatalogDetailPayload>(`/api/components/catalog/${slug}`),
    fetchResolution: async () => await fetchPayload<ComponentsResolutionPayload>('/api/components/resolution'),
  }
}

async function fetchPayload<T>(path: string): Promise<T> {
  const response = await $fetch(path) as ApiEnvelope<T> | T

  if (isApiEnvelope<T>(response)) {
    if (response.success === false || response.isSuccess === false) {
      throw new Error(response.message || `Request failed for ${path}`)
    }

    if (response.data === undefined || response.data === null) {
      throw new Error(`Missing response data for ${path}`)
    }

    return response.data
  }

  return response
}

function isApiEnvelope<T>(value: ApiEnvelope<T> | T): value is ApiEnvelope<T> {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'data' in value || 'success' in value || 'isSuccess' in value
}

declare module '#app' {
  interface NuxtApp {
    $componentsPlaygroundAdapter?: ComponentsPlaygroundHostAdapter
  }
}
