# layer-components-playground

Shared Nuxt layer for components catalog + detail playground pages.

## Host Adapter Contract

Hosts can override `/app/composables/components-playground/useComponentsPlaygroundAdapter.ts` and provide:

- `fetchCatalog()`
- `fetchCatalogDetail(slug)`
- `fetchResolution()`

Default behavior calls:

- `GET /api/components/catalog`
- `GET /api/components/catalog/{slug}`
- `GET /api/components/resolution`
