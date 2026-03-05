export type ComponentsChannel = 'dev' | 'staging' | 'production'

export type ComponentsResolutionPayload = {
  channel: ComponentsChannel
  releaseId: string
  cdnBaseUrl: string
  vueEsmUrl?: string | null
  bundleCssUrl?: string | null
  manifestKey: string
  componentsIndexKey: string
  fixturesKey: string
  schemasPrefix: string
  vueEsmKey: string
  bundleCssKey: string
  integrityKey: string
  hashes: {
    manifest: string | null
    componentsIndex: string | null
    fixtures: string | null
    vueEsm: string | null
    bundleCss: string | null
  }
}

export type ComponentsCatalogItem = {
  slug: string
  label: string | null
  description: string | null
  category: string | null
  uxCategory: string | null
  version: string | null
  stability: string | null
  visibility: string | null
}

export type ComponentsCatalogPayload = {
  channel: ComponentsChannel
  releaseId: string | null
  components: ComponentsCatalogItem[]
}

export type ComponentsCatalogDetailPayload = {
  channel: ComponentsChannel
  releaseId: string | null
  slug: string
  label: string | null
  description: string | null
  category: string | null
  uxCategory: string | null
  version: string | null
  stability: string | null
  visibility: string | null
  defaultConfig: Record<string, unknown> | null
  jsonSchema: Record<string, unknown> | null
  compiledContract: Record<string, unknown> | null
  tags: unknown[] | null
  requirements: unknown[] | null
  ai: Record<string, unknown> | null
}

export type ComponentsRuntime = {
  getPod?: (slug: string) => unknown | null
  renderPod: (args: {
    slug: string
    mountSelector: string
    props?: Record<string, unknown>
  }) => void
  updateProps: (args: {
    mountSelector: string
    props: Record<string, unknown>
  }) => void
  unmount: (args: { mountSelector: string }) => void
}

export type ComponentsPlaygroundHostAdapter = {
  fetchCatalog: () => Promise<ComponentsCatalogPayload>
  fetchCatalogDetail: (slug: string) => Promise<ComponentsCatalogDetailPayload>
  fetchResolution: () => Promise<ComponentsResolutionPayload>
}

declare global {
  interface Window {
    __RFM_COMPONENTS_VUE__?: ComponentsRuntime
  }
}
