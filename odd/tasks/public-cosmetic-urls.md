# Public cacheable cosmetic URLs (card frames plan, stage 0)

Branches: `evolution-api` `feat/public-cosmetic-urls`, `evolution-card-cdn` `feat/public-cosmetics`, client `evolution-card-game` (SW rule). Engram mirror: `odd/public-cosmetic-urls/tasks`. TDD on. Runners: API `bun test <files>`; worker verified with `wrangler dev` (no TS test setup); client `npx vitest run <files>`.

## Specs

S1. Active cosmetics are served from public, immutable URLs `<COSMETICS_PUBLIC_BASE_URL>/<assetRef><file>` instead of signed URLs, so browsers and the service worker cache them across sessions. User: "si, agregalo como etapa 0" (to: "URLs públicas, fijas y cacheables para siempre ... firma solo para lo que todavía no se publicó o está inactivo").
S2. Inactive or unpublished cosmetics stay private: the public route serves only the asset refs listed in a public index the API writes to R2 at `_public/cosmetics-index.json` (outside the prefixes `evolution-cosmetics` syncs), rebuilt at API start (after migrations, the only place `active` changes) and after every publish/seed; anything else answers 404.
S3. The API keeps the `assets` / `assetsExpiresAt` response shape. Active cosmetics get public URLs with `assetsExpiresAt: null` (the client already treats null as never expiring); inactive ones stay signed. With `COSMETICS_PUBLIC_BASE_URL` unset, everything stays signed exactly as today.
S4. Ownership and equipping are unchanged: still validated server-side.
S5. The client caches the public cosmetic URLs with a service-worker CacheFirst rule.

## Tasks

- [x] T1 (S1, S2) Worker route `/cosmetics/<assetRef><file>` in `evolution-card-cdn` with an R2 binding to bucket `evolution`, checked against the public index, immutable + CORS + CORP headers. Route: delegated writer (parallel with T2). Commit: `evolution-card-cdn` `dc6a8af`.
- [x] T2 (S2, S3, S4) API: public-first asset URL provider wrapping the signer, the public index writer (start + publish/seed), config `COSMETICS_PUBLIC_BASE_URL`. Route: delegated writer (parallel with T1).
- [x] T3 (S5) Client SW CacheFirst rule for `/cosmetics/` on the CDN host. Route: inline. Commit: `evolution-card-game` `feat/public-cosmetic-cache` `d3fdd23e`.
- [ ] T4 Rollout: deploy worker, write the index, deploy API with the env var, verify caching in a second session. Route: inline, with user deploys.

Risk: item 2 (the public index is the guard deciding what is public), item 3 (asset URL contract), item 5 (worker and API deploys).

## Log

L1 (2026-10-30): Plan agreed: stage 0 before card frames (see Engram `plan/card-frames-cosmetics`). Evidence: the public loadout signs any player's equipped items without checks; `PublishCosmetic` rejects a reused `assetRef`, so published assets are immutable; signed URLs (TTL 600 s) change on every signing, defeating HTTP/SW caches. Client `assetCache.resolveExpiration` returns null for an explicit null expiry ("fresh" forever). `active` changes only in migrations. Signing call sites: GetCosmeticsCatalog, GetCosmeticAssets, GetAdminCosmetics, GetMyLoadout, GetBotLoadout, public loadout, GetMyEmoteBar, GetShop, PrizeTierView, GetEvent, scripts/index-cosmetic-assets.

L2 (2026-10-30): T2 implemented uncommitted on `feat/public-cosmetic-urls`. `createR2AssetUrlSigner()` wraps the R2 signer in `PublicFirstAssetUrlSigner` only when `COSMETICS_PUBLIC_BASE_URL` is set. `RefreshPublicCosmeticIndex` reloads the active refs and writes `_public/cosmetics-index.json`; it runs at boot (not awaited), after a successful publish, and after a seed that created rows, through the `CatalogChangeNotifier` port. RED was observed for every rule. GREEN: `bun test` 1116 pass, 0 fail; `bun run build` OK; Biome is clean on src/tests/docs. `bun run lint` fails only on the untracked `.atl/.skill-registry.cache.json`, which T2 did not touch.
L3 (2026-10-30): T1 by a bounded writer (`dc6a8af`): verified on local `wrangler dev` (listed hit 200 immutable/CORS/CORP/ETag, unlisted 404, nested kit path 200, traversal variants 404, missing index 404, HEAD, OPTIONS 204), dry-run deploy bundles. T3 inline: RED then GREEN on `swCosmeticsRule.test.ts`, rule present in the built `sw.js` (`statuses: [200]`, never opaque). Parent re-ran T2: `bun test` 1116 pass, `tsc` clean, Biome clean on src/tests/docs. The first T2 launch ran in a worktree of the wrong repository and changed nothing; it was relaunched without isolation.
L4 (2026-10-30): Independent verifier: S2-S5 PASS (env-unset signer identical to baseline; exact-prefix matching; index lists active refs only; worker serves only listed refs, traversal 404, unlisted 404, removal honoured within ~60 s despite edge cache, /pics unchanged; API URL to worker key round-trip OK with spaces/unicode/#/?; client rule cross-origin /cosmetics/ only, status 200 only). Blocker B1: `RefreshPublicCosmeticIndex` replaced the in-memory set before writing the index, so a failed write handed out public URLs the CDN answers with 404. Advisory A1: even after a good write, worker isolates keep the old index up to 60 s. Fix (RED then GREEN): write the index first; on success drop refs no longer active at once, wait 65 s (CDN index TTL plus margin), then publish the new set; on failure keep the previous set. `bun test` 1118 pass, `tsc` clean, Biome clean. Other advisories accepted: A2 `active` changed outside the API needs a restart; A3 base URL with query/credentials is operator error; A4 query-string cache variants; A5 literal `%` in a synced file name.
