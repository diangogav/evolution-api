# Card frames as a cosmetic type (card frames plan, stage 2)

Branch: `feat/card-frame-cosmetic`. Engram: `plan/card-frames-cosmetics`. TDD on; runner `bun test <files>`, full `bun test`, `bun run build`, `npx biome check src tests docs`.

## Specs

S1. A new cosmetic type `CARD_FRAME` that players can own and equip like any other type (one loadout slot), with asset prefix `frames/`. User: "si" to the plan's stage 2 ("tipo `CARD_FRAME` en la API, la regla para publicar kits ... y el marco anime como gratis para todos").
S2. Publishing a frame accepts a whole kit: `layout.json` (validated), `preview.webp` (the inventory thumbnail), and the layers the layout names (`.png`), in subfolders (`frame/normal.png`, `digits/1.png`, ...). Paths are safe relative paths; subfolders are allowed for `CARD_FRAME` only; per-type file-count and size caps.
S3. Other cosmetic types publish exactly as before (8-file cap, flat names).
S4. The standard anime frame is published through the admin endpoint as STANDARD after deploy (operational step), not seeded by code; the client keeps its bundled anime kit as the default.

## Tasks

- [x] T1 (S1-S3) enum + enum-only migration, `frames` prefix, kit validation in `PublishCosmetic`, admin route file cap sized for kits. Route: delegated writer (context backstop).
- [ ] T2 (S4) After deploy: publish `frames/anime/` (STANDARD) with the kit from `evolution-card-cdn` `kit/styles/anime/`. Route: inline, with user.

## Log

L1 (2026-10-30): Stage 0 is live (public immutable URLs for active cosmetics; nested paths supported by the CDN worker and the API's per-segment encoding). Client already loads published kits through `publishedKit(id, assets)` keyed by file path (`evolution-card-game` `feat/card-styles` `1da20373`), so the API's `assets` map must be keyed by the kit-relative path including subfolders.
L2 (2026-10-30): T1 by a bounded writer, re-run by the parent: `bun test` 1150 pass, `tsc` clean, Biome clean. `CosmeticType.CARD_FRAME` (equippable; every `t.Enum(CosmeticType)` picks it up), enum-only migration `1782600000000` (down deletes CARD_FRAME rows, like AMBIENCE), `CardFrameKit.ts` (layout.json needs `canvas` + `artWindow`; paths up to 3 segments, folders `^[a-z0-9][a-z0-9-]*$`, file `^[A-Za-z0-9][A-Za-z0-9._-]*$`), PublishCosmetic: `frames` prefix, 200 files, layout.json + preview.webp + `.png` only, for CARD_FRAME only; admin route `maxItems` 200. Multipart `File.name` keeps `/` in Bun 1.4.4 + Elysia 1.4, so the file name carries the kit path (the uploader must name each File with its relative path). RED for every rule except the equip test (passes at runtime with an undefined enum member; caught only by tsc).
L3 (2026-10-30): Independent verifier: S3 PASS (PublishCosmetic outputs byte-identical to base for every other type over 13 inputs), migration and equip PASS, signers and CDN round-trip nested paths and `?`. Blocker B1: `FILE_SEGMENT` refused `digits/-.png` and `digits/?.png`, which the client draws negative/unknown ATK/DEF with, so the real kit could not publish. Fix (RED then GREEN): file names may start with or contain `?` and `-`, never start with a dot; folders unchanged. The real anime kit (81 files with preview) now passes `isSafeKitPath` and `assertCardFrameKitFiles`. B2 accepted: other types with 14-200 files now get the use case's 400 "between 1 and 8 files" instead of Elysia's 422 (still rejected, clearer message; 9-13 files already got 400). A route test could not pin it because the route test app has no domain error mapping (500 there); the use-case cap test pins the rule. Advisory A1 for S4: upload only layout.json, preview.webp and the .png layers (not README.md or previews/).
