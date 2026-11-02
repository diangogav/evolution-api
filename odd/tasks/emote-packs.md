# Emote packs

## Objective

Offer emote packs as cosmetics in EvoDuel. A player owns packs and builds a custom
emote bar from the default emotes plus any emote of any pack they own.

## Problem

Emotes are a fixed set of 8 bundled Noto Lottie files, hard-coded in the client
(`evolution-card-game/src/features/emotes/domain/emoteCatalog.ts`) and in the duel
server (`EDOpro-server-ts/src/ygopro/emote/emote-protocol.ts`, `EMOTE_IDS`). There is
no way to ship, own or select additional emotes.

## Why

Emotes are heavily used in duels. Packs (first one: Halloween Duelist, 8 emotes made
in `evolution-emote-studio`) are a cosmetic players can be rewarded with.

## Decisions

- A pack is one cosmetic of a new type `EMOTE_PACK`. Its R2 folder
  (`emote-packs/<slug>/`) holds `pack.json` (slug, emote keys, labels, order) and one
  Lottie JSON per emote. It reuses `assetRef`, signed URLs, entitlements and publish.
- Acquisition uses existing mechanisms only: tier coverage and admin COSMETIC grants.
  No shop, currency or purchase flow.
- The emote bar has 8 slots, stored separately from the one-item-per-type loadout.
  Each slot holds a default id (`wave`) or a pack emote ref `<pack-slug>/<emote-key>`.
  A player with no saved bar gets the 8 defaults.
- Saving the bar validates every ref: default ids always; pack refs only when the
  pack is an active EMOTE_PACK the user can use and the key exists in its `pack.json`.
- The opponent's client loads the sender's public emote bar (with signed asset URLs),
  like it already loads the public loadout. A received emote is played only if it is
  a default or is in the sender's bar; anything else is dropped.
- The duel server keeps no emote catalog and does not validate ids (user decision,
  2026-10-14): it cannot check ownership, and the deployed client already drops ids
  it does not know. It keeps the Mercury-only and seated-duelist gates, the 2.5 s
  cooldown, and a 48-byte body cap, and relays the body byte for byte.

## Scope

Repos: evolution-api, EDOpro-server-ts, evolution-card-game, evolution-backoffice.
Out of scope: shop, purchases, currency, seasonal rotation, emote sounds.

## Constraints

- Server must accept pack refs before any client sends them (deploy order: duel
  server, API, client).
- Uploaded Lottie must be vector-only (no image assets, fonts or expressions) and
  size-capped; it is rendered by `lottie-web` `lottie_light` (svg).
- Existing clients without the feature keep working with default emotes.
- `evolution-api/src/evolution-types` has local modifications not part of this work.

## Tasks

Route: T1 delegated writer (2+ non-trivial files: domain type, migration, publish rules, tests).
Route: T4 inline (2 small files, already understood).
Route: T1b + T2 delegated writer (domain, migration, use cases, router, tests).

- [x] T1 API: `EMOTE_PACK` cosmetic type (domain enum + DB enum migration) and publish
      rules (prefix `emote-packs`, `pack.json` schema, vector-only Lottie validation,
      file count/size limits).
- [x] T1b API: depth-bound the Lottie tree walk so deeply nested JSON is a 400 (review follow-up).
- [x] T2 API: emote bar domain, table and `GET`/`PUT /me/emote-bar` with ownership
      validation.
- [x] T3 API: public `GET /users/by-username/:username/emote-bar` with signed URLs.
- [x] T4 Duel server: drop the emote id catalog, cap the body at 48 bytes.
- [x] T5 Client: dynamic emote catalog (defaults + own bar), emote bar UI from the
      bar, balloon plays signed URLs, opponent emotes validated against their public bar.
- [x] T6 Client: inventory screen to build the bar from defaults and owned packs.
- [ ] T7 Backoffice: publish `EMOTE_PACK` cosmetics. (Paused by the user, 2026-10-14.)
- [ ] T8 Content: assemble the Halloween Duelist pack, publish to dev, grant, and
      check end to end in dev.

## Acceptance criteria

- A player who owns a pack can put any of its emotes in any of the 8 slots and send it.
- The opponent sees the animation; spectators receive it as today.
- A ref not in the sender's bar is never played by the receiver.
- Saving a bar with an unowned or unknown ref is rejected.
- Players without packs see exactly today's behavior.

## Checks

- TDD: strict, from session configuration (Strict TDD Mode: enabled).
- evolution-api: `bun test`, `biome check .`
- EDOpro-server-ts: `npm test` (jest), `npm run check`
- evolution-card-game: `npm test` (vitest), `npm run typecheck`, `npm run lint`
- evolution-backoffice: `npm test`, `npm run check`

## Delivery

Strategy: ask-on-risk; chain strategy `stacked-to-main` (user choice, 2026-10-14).
Forecast exceeds 400 authored lines in total; each repo ships its own PRs, each
targeting `main` and merged in order.

## Progress

- 2026-10-14: exploration done, design agreed with the user (custom bar), document created.
- 2026-10-14: T1 done in `0bafd90` (+687/-4; ~290 production, rest tests). `bun test`
  607 pass / 0 fail (parent re-ran: 0 fail), `bun run lint` clean, `tsc --noEmit` clean.
  RED observed for both domain suites, EquipCosmetic and 5 PublishCosmetic cases.
  Admin upload schema `maxItems` is now 13 for every type; `PublishCosmetic` keeps 8
  for non-emote types. Review: medium (migration), consent granted, reliability lens
  approved and acknowledged (lineage review-5de3617d7787ae10). Reviewed boundary: `0bafd90`.
  Advisory follow-ups (non-blocking): unbounded recursion in `LottieAnimation`
  expression walk can throw RangeError (500) on deeply nested JSON; untested 13-file
  upper bound, unbounded w/h, untested migration `down()`, one overclaiming test name.

- 2026-10-14: T4 done in EDOpro-server-ts `70183c9e` on `feat/emote-pack-refs`
  (+79/-53). RED: 3 RoomState tests (pack ref, 48 bytes, byte-not-char cap). `npm test`
  2278 pass, `tsc --noEmit` clean, biome clean on changed files (`npm run check` has
  pre-existing errors on `main`). Review assess: medium, `under_budget` (132 lines),
  no review due. An earlier approved review covered only the discarded RED tests
  (lineage review-1a19909ee9c04349).
- Plan presented to the user and approved on 2026-10-14.
- 2026-10-14: T4 pushed; PR diangogav/EDOpro-server-ts#418 (base `main`) opened at the user's request.

- 2026-10-14: T1b `3b4347b` on `feat/emote-packs` (+36/-8): iterative walk, max depth 64,
  400 on deeper input. Assess medium, under budget (44 lines), no review due.
- 2026-10-14: T2 on `feat/emote-bar` (from `feat/emote-packs`): `e5af79a` domain +
  persistence, `e655c5b` GET/PUT `/me/emote-bar` (~280 production lines, rest tests).
  Module `src/modules/emote-bar/`; table `user_emote_bars(user_id PK, emote_refs
  varchar(48)[8])`. `bun test` 667 pass / 0 fail (parent re-ran). Review: medium,
  granted, approved and acknowledged (lineage review-fc5f9be856950e85). Reviewed
  boundary: `e655c5b`. Accepted warnings reopened as T2b.
- [x] T2b API: stale slots resolve to distinct defaults; single-statement upsert;
  lenient read of stored bars; robust slug derivation; GET tests without a body.

- 2026-10-14: T2b `2964fa6` (+286/-42): `bun test` 683 pass (parent re-ran). Assess
  medium, under budget (328 lines), no review due.
- 2026-10-14: API PRs opened as a stack (size exceptions for #109 at 719 and #111 at
  765 accepted by the user; excess is tests): #109 `feat/emote-packs` -> main,
  #110 `feat/emote-bar-domain` -> #109, #111 `feat/emote-bar-api` -> #110,
  #112 `feat/emote-bar` -> #111. Do not deploy the API between #111 and #112.

- 2026-10-14: #109, #110, #111 squash-merged into `main` (fae0be1, 382a07a, dbf80d7).
  #112 conflicted because its branch still carried the pre-squash commits; rebased with
  `git rebase --onto origin/main e655c5b` to `8a04760` (only the fix), `bun test` 683 pass,
  force-pushed with lease; #112 is now mergeable against `main` (+286/-42).

- 2026-10-14: #112 squash-merged (997d9d5).
- 2026-10-14: T3 `6349dd1` on `feat/public-emote-bar` (from main, +198): new
  `public-emote-bar-router.ts` + `GetPublicEmoteBar` (reuses `GetMyEmoteBar`), mirrors
  the public loadout: no auth, 404 for unknown username, banned users served, no rate
  limit, `private, no-store`. `bun test` 687 pass (parent re-ran). Assess medium,
  under budget (198), no review due.

- 2026-10-14: T3 PR diangogav/evolution-api#113 (`feat/public-emote-bar` -> main) opened.
- 2026-10-14: #113 squash-merged into main.
- 2026-10-14: T5 started in evolution-card-game on `feat/emote-bar-duel` (from main);
  route: delegated writer (many client files).

- 2026-10-14: T5 on evolution-card-game `feat/emote-bar-duel`: `f4afaf81` API client +
  bar model (130 prod/140 test), `690d056f` own bar picker + 48-byte wire cap (274/219),
  `dad23202` opponent admission + signed playback (153/350). Emote tests 73 pass (parent
  re-ran), typecheck clean, lint 0 errors; full `npm test` 1 unrelated flake
  (`cardArtStore.test.ts`, passes alone). Review: medium, granted, approved and
  acknowledged (lineage review-7e6909b6cdbe9e96). Pack emote fallback glyph is ✨.
  Accepted warnings reopened as T5b. Known pre-existing gap: tag-duel seats 2/3 are
  dropped by the existing `hasPerspective` gate.
- [x] T5b Client: stale in-flight bar refresh after reset; delayed pack emote play can
  replace a newer emote.

- 2026-10-14: T8 prep: Halloween Duelist pack assembled outside the repos in the user's
  Downloads folder (`halloween-duelist-pack/`: `pack.json` + 8 Lottie; `draw` from the
  newest export). It passes the API's `assertEmotePackFiles` (9 files). `publish.sh` there
  publishes it (`EMOTE_PACK`, tier `EXCLUSIVE`, `emote-packs/halloween-duelist/`) and
  grants it (`CAMPAIGN`). Publishing in dev is the user's step (needs an admin token).

- 2026-10-14: T5b `1325dbf9` (+13/-4 prod, +76 tests): exact-promise in-flight delete;
  per-side sequence drops delayed pack plays; detach/reset cancel pending plays. RED: 4
  tests. Emote tests 79 pass (parent re-ran), full `npm test` 7393 pass, typecheck clean,
  lint 0 errors. Assess medium, under budget (93), no review due.

- 2026-10-14: user ran `publish.sh` against the production API: HTTP 500 "R2 upload
  size mismatch ... pack.json: local=538, write=538, remote=0". Publish cleans up on
  failure (no rows, no objects). The upload script, which verifies with `list()`,
  stored the same file as 538 bytes (probe key `emote-packs/probe/pack.json`, to be
  deleted by the user). Cause: `R2CosmeticAssetStorage` verified with `stat()`, which
  reports 0 for this object. Fix `9f7d1a3` on `fix/r2-asset-size-check`: verify from
  the listing (+82, 4 tests, RED 2). `bun test` 691 pass, lint and tsc clean. Assess
  medium, under budget, no review due.
- [x] T8b API: R2 size check fix PR, deploy, re-run `publish.sh`.

- 2026-10-14: PRs opened at the user's request: evolution-api#114 (R2 fix ->
  main); evolution-card-game #228 `feat/emote-bar-model` -> main (+269/-1), #229
  `feat/emote-bar-picker` -> #228 (+478/-15), #230 `feat/emote-bar-duel` -> #229
  (+554/-34). Client needs EDOpro-server-ts#418 deployed first.

- 2026-10-14: #114 squash-merged (acc546d); user reports the API is deployed with it.

- 2026-10-14: `publish.sh` succeeded against production: the Halloween Duelist
  EMOTE_PACK (EXCLUSIVE, 9 files) was granted to a test account (CAMPAIGN). Probe
  object `emote-packs/probe/pack.json` still to be deleted by the user.

- 2026-10-14: user saved a bar for the test account in production via PUT /me/emote-bar;
  4 pack slots returned signed URLs. Open check: R2 bucket CORS for the game origin
  (Lottie and pack.json are fetched from r2.cloudflarestorage.com).
- 2026-10-14: stop-hook review of the whole client candidate (T5 + T5b, 1331 lines):
  granted, approved and acknowledged (lineage review-1832ef6dda3bbd1f). Advisory
  warnings: overlapping `loadOwn` calls can settle out of order; a failed own-bar
  refetch drops to defaults instead of keeping the previous bar; a sender whose bar
  was never prepared loses pack emotes for the whole duel; no test for the
  DuelOverlay duel-start wiring; no skew margin on URL expiry.
- [x] T5c Client: fix the three warnings above.

- 2026-10-14: T5c `f5aa9291` (82 prod / 218 test): `_ownSeq` ordering, keep own bar on
  refetch failure for the same token, on-demand fetch for unprepared senders (plays if
  still newest), 30 s expiry margin, `loadDuelEmoteBars` extracted and tested. RED
  observed per fix. Emote tests 96 pass (parent re-ran), full `npm test` 7410 pass.
  Assess medium, under budget (300). Shipped as its own PR #231
  (`feat/emote-bar-recovery` -> `feat/emote-bar-duel`) because adding it to #230 would
  have taken #230 to ~892 lines; merge it together with #230.

- 2026-10-14: T6 started on `feat/emote-bar-editor` (from `feat/emote-bar-recovery`);
  route: delegated writer.

- 2026-10-14: T6 on `feat/emote-bar-editor`: `ebce250b` editor logic + PUT + EMOTE_PACK
  mapping (~280 prod / 342 test), `1e2c2235` Inventory "Emotes" wing + i18n (~340 / 289).
  463 emotes+inventory tests pass (parent re-ran), full `npm test` 7464 pass. Pack slug is
  read from the signed pack.json URL path because `/me/cosmetics` does not expose
  `assetRef` (works with the production URL shape; an API field would be sturdier).
  Review: medium, granted, approved and acknowledged (lineage review-47f9026ff847cb2d).
  Warning: a pick before the saved bar loads overwrites it with defaults; plus an
  unhandled RangeError path and sign-out on the Emotes wing. Reopened as T6b.
- [x] T6b Client: block edits until the saved bar loads; no unhandled rejection; reset
  the wing on sign-out.

- 2026-10-14: T6b `fcceda9c` (114 prod / 152 test): `loadedFor`/`loadFailed` on the own
  bar store, editor disabled + service guard until loaded, retry on failure, RangeError
  inside the guarded path, effective wing falls back to covers on sign-out. RED per fix.
  476 emotes+inventory tests pass (parent re-ran), full `npm test` 7477 pass. Assess
  medium, under budget (266).

- 2026-10-14: T6 PRs #232 (logic), #233 (Emotes wing), #234 (fixes) opened. At the
  user's request, merged the whole client chain #228–#234 by squash, rebasing each child
  onto main first (`main` = 8f011220). `main` tree is identical to the reviewed
  `fcceda9c`. CI on main was pending at merge time. EDOpro-server-ts#418 was already
  merged by the user.

## Next step

T7 paused. Pending outside code: deploy the duel server (#418) before the client,
check R2 CORS for Lottie fetches, delete the R2 probe object, and test a duel with
the test account's bar. After merges: rebase each child onto main (squash merges). Then T6 (bar editor).

## T8 — Inventory: play picked emotes on the stage preview (client)
- [x] Pedestal stays visible on the Emotes wing; picking a choice or clicking a filled slot plays it via `EmoteBalloon side="local" embedded` (editor `onplay` prop, Inventory triggers `emoteStore`, reset on leaving the wing).
- Route: delegated writer (3 non-trivial files). TDD: 8 RED → GREEN. Checks: vitest emotes+inventory 485 pass, `npm test` 7486 pass, lint 0 errors, check:svelte 0 errors.
- Parent fix: dropped writer's `position: relative` on `.stage-preview` to keep the existing preview layout unchanged; balloon anchors to `.pedestal`.
- Commit `82133abf` on `feat/emote-preview-on-stage` (evolution-card-game), not pushed. RDD assess: medium, `under_budget` (142 lines) → no review due.
- Follow-up commit `93b34251` (style): picker cells 40→56px, thumb SVG fills its box, duel balloon 84→128px (mobile 68→96). Checks: vitest emotes+inventory+duel 1786 pass, check:svelte/oxlint 0 errors.
- RDD: review-56bfe91492ff6250 granted, approved and acknowledged (both commits). Advisory suggestions only (untested pick guard, slot play when unfilled, stale emote on wing entry).
- Delivered: PR #235 squash-merged to evolution-card-game main as 3532f99a (tree identical to 93b34251).
- Follow-up commit dd44173a on style/bigger-emotes: picker 56→72px, balloon 128→176px (mobile 96→128). RDD review-be08569cf9ab3cae approved+acknowledged (1 advisory suggestion on picker cell size). Not pushed.
- Delivered: PR #236 squash-merged to main.

## T9 — Emote editor action menu + viewport playback (client)
- [x] Choice tap opens a menu (Assign to slot N / Play / Cancel): popover on desktop, bottom sheet ≤1023px. Play shows the balloon centred in the viewport (`EmoteBalloon placement="viewport"`); embedded stage mode removed. i18n en/es-419.
- Commit `7b55f696` (writer, delegated: 3+ non-trivial files). TDD 9 RED → GREEN. npm test 7490 pass, lint/check:svelte 0 errors.
- RDD review-6953a9155cdcb64f granted, approved, acknowledged. Advisory WARNING (popover off-screen near viewport bottom) fixed in follow-up `2c99442c` with flip-above + tests (491 pass); one-menu test strengthened.
- Branch `feat/emote-editor-action-menu`, not pushed.
- RDD review-2f68e123b192d0bf (both commits) granted, approved, acknowledged. Advisory: assign no-op while saving, Escape propagation, scroll/resize dismiss untested.
- Delivered: PR #237 squash-merged to main.
