type ApiEnvelope<T> = {
  success?: boolean
  isSuccess?: boolean
  data?: T
  message?: string
}

type MediaListPayload = {
  items?: MediaLibraryItem[]
}

type MediaDownloadPayload = string | {
  url?: string
}

export type MediaLibraryItem = {
  id: string
  name: string
  originalName?: string
  url?: string | null
  downloadUrl?: string
  s3Key?: string
  mime?: string
  mediaType?: string
  altText?: string
  width?: number
  height?: number
}

export type MediaLibrarySelection = {
  item: MediaLibraryItem
  url: string
}

export function useComponentsPlaygroundMediaLibrary() {
  const config = useRuntimeConfig()
  const authCookie = useCookie<{ token?: string } | null>('auth')

  const baseURL = computed(() => {
    const apiBase = String(config.public.apiBase || '').trim()
    if (apiBase) {
      return apiBase
    }

    const componentsApiBase = String(config.public.componentsApiBase || '').trim()
    return componentsApiBase || undefined
  })

  const headers = computed<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = {
      Accept: 'application/json',
    }

    const token = authCookie.value?.token?.trim()
    if (token) {
      nextHeaders.Authorization = `Bearer ${token}`
    }

    return nextHeaders
  })

  async function searchImages(query = ''): Promise<MediaLibraryItem[]> {
    const response = await $fetch<ApiEnvelope<MediaListPayload> | MediaListPayload>('/api/media', {
      baseURL: baseURL.value,
      headers: headers.value,
      params: {
        type: 'image',
        per_page: 24,
        ...(query.trim() ? { q: query.trim() } : {}),
      },
    })

    const payload = unwrapEnvelope(response)
    return Array.isArray(payload.items) ? payload.items : []
  }

  async function resolveMediaUrl(item: MediaLibraryItem): Promise<string> {
    const directUrl = item.url?.trim() || item.downloadUrl?.trim()
    if (directUrl) {
      return directUrl
    }

    const response = await $fetch<ApiEnvelope<MediaDownloadPayload> | MediaDownloadPayload>(
      `/api/media/${item.id}/download-url`,
      {
        baseURL: baseURL.value,
        headers: headers.value,
      },
    )

    const payload = unwrapEnvelope(response)
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim()
    }

    if (payload && typeof payload === 'object' && typeof payload.url === 'string' && payload.url.trim()) {
      return payload.url.trim()
    }

    throw new Error('Selected media is missing a usable URL.')
  }

  return {
    searchImages,
    resolveMediaUrl,
  }
}

function unwrapEnvelope<T>(response: ApiEnvelope<T> | T): T {
  if (!response || typeof response !== 'object') {
    return response as T
  }

  if (!('success' in response) && !('isSuccess' in response) && !('data' in response)) {
    return response as T
  }

  const envelope = response as ApiEnvelope<T>
  if (envelope.success === false || envelope.isSuccess === false) {
    throw new Error(envelope.message || 'Media library request failed.')
  }

  if (envelope.data === undefined) {
    throw new Error(envelope.message || 'Media library response is missing data.')
  }

  return envelope.data
}
