# Cosmetics

Cosmetics (sleeves, playmats, avatars, card backs, summon effects, music,
titles, "lanes") are stored in a catalog, gated behind entitlements, equipped
into a per-user loadout, and served as short-lived signed URLs pointing at a
private R2 bucket. This is the only domain area using the **cosmetics**
DataSource, not the shared `evolution-types` one (`docs/architecture.md`'s
Data section).

## Catalog

`CosmeticEntity` (`src/modules/catalog/infrastructure/CosmeticEntity.ts`) has
`type` (`CosmeticType`: `SLEEVE`, `PLAYMAT`, `CARD_BACK`, `AVATAR`,
`SUMMON_EFFECT`, `MUSIC`, `TITLE`, `LANE`), `tier` (`CosmeticTier`), an
`assetRef` (an R2 folder prefix, must end in `/`), a `displayName`, an
`active` flag, and an optional `assetFiles` list (the file basenames under the
prefix, when known ahead of time) —
`src/modules/catalog/domain/Cosmetic.ts:5-44`.

`GET /cosmetics` (public catalog) and `GET /me/cosmetics` (`me-cosmetics-router.ts`)
both go through `GetCosmeticsCatalog.run`
(`src/modules/catalog/application/GetCosmeticsCatalog.ts`), which:

1. Loads every cosmetic.
2. Resolves the caller's access **once** via `EntitlementsGatekeeper`
   (one repository fetch regardless of catalog size).
3. Filters to `cosmetic.active && access.canUse(cosmetic)`, plus optional
   `type`/`tier` filters.
4. Signs each visible cosmetic's asset manifest.

So an **inactive cosmetic never appears in either catalog listing**,
regardless of tier or entitlement.

### Standard and seeded cosmetics

`SeedStandardCosmetics.run` (`src/modules/catalog/application/SeedStandardCosmetics.ts`)
idempotently inserts the fixed list in
`src/modules/catalog/application/standardCosmetics.ts`, matching existing rows
by `assetRef` so re-running only inserts what's missing — it never updates an
already-seeded cosmetic's tier. This seed is what stocks the free
(`STANDARD`) and account-gated (`REGISTERED`) starter items (classic/Evolution
sleeves, the default 2D stage, etc.); `bun run seed:cosmetics` runs it (see
`docs/architecture.md`/`package.json`).

## Entitlements

An `Entitlement` (`src/modules/entitlements/domain/Entitlement.ts`) grants
either a cosmetic **tier** (`grantType: TIER`, `grantValue` one of the
`CosmeticTier` values) or one specific **cosmetic**
(`grantType: COSMETIC`, `grantValue` the cosmetic id), tagged with a `source`
(`REGISTRATION | DONATION | PURCHASE | CAMPAIGN`) and an optional `expiresAt`.
`isActiveAt(date)` is true when `expiresAt` is `null` or still in the future.

Access is resolved by `EntitlementsGatekeeper`
(`src/modules/entitlements/application/EntitlementsGatekeeper.ts`), the
**single access gate** — callers never compare tiers themselves:

- `accessFor(userId, at)` returns a `CosmeticAccess` snapshot: `CosmeticTier.STANDARD`
  with no cosmetic ids for an anonymous caller (`userId === null`);
  otherwise `CosmeticTier.DONOR` if the user has an active `TIER` entitlement
  with `grantValue === DONOR`, else `CosmeticTier.REGISTERED` — **every
  authenticated user is at least `REGISTERED`, with no entitlement row
  needed for that baseline.**
- `canUse(userId, cosmetic)` = `accessFor(...).canUse(cosmetic)`.

`CosmeticAccess.canUse` (`src/modules/entitlements/domain/CosmeticAccess.ts`)
grants a cosmetic when the user's tier ranks at or above the cosmetic's tier
(`tierGrants`, `src/modules/entitlements/domain/accessTier.ts`: `STANDARD < REGISTERED
< DONOR < EXCLUSIVE`), **or** the user holds a specific `COSMETIC` entitlement
for that cosmetic's id. `EXCLUSIVE` is ranked above every tier the gatekeeper
ever assigns, so it is deliberately unreachable through the tier path — the
only way to unlock an `EXCLUSIVE` cosmetic is a per-user `COSMETIC`
entitlement.

Admins grant a specific cosmetic with `POST /admin/cosmetics/:id/grants`
(`GrantCosmeticToUser`, `src/modules/entitlements/application/GrantCosmeticToUser.ts`),
choosing the `source` value per grant (there is no automatic entitlement
granted at registration in the current code — `REGISTRATION` is one of the
four `source` choices an admin can pick, not something the register flow sets
on its own). The grant is idempotent: granting an already-active entitlement
for the same cosmetic returns `created: false` instead of duplicating it.
Granting a cosmetic that doesn't exist or is inactive is rejected with
`NotFoundError` (`GrantCosmeticToUser.ts:31-34`).

## Loadout

`Loadout` (`src/modules/loadout/domain/Loadout.ts`) is a map of at most one
cosmetic id per `CosmeticType` — equipping a new item in a slot silently
replaces whatever was equipped there.

- `PUT /me/loadout` → `EquipCosmetic.run` (`src/modules/loadout/application/EquipCosmetic.ts`):
  loads the cosmetic, checks its `type` matches the requested slot, checks
  `gatekeeper.canUse` (`ForbiddenError` if not entitled, `NotFoundError` if
  the cosmetic id doesn't exist), then saves the updated loadout.
  **`EquipCosmetic` does not check `cosmetic.active`** — only the catalog
  listing filters inactive cosmetics out, so a client that already knows an
  inactive cosmetic's id can still equip it if the entitlement check passes.
- `GET /me/loadout` → `GetMyLoadout.run` (`src/modules/loadout/application/GetMyLoadout.ts`):
  for each equipped slot, looks the cosmetic up and signs its asset manifest.
- `GET /users/by-username/:username/loadout` → `GetPublicLoadout.run`
  (`src/modules/loadout/application/GetPublicLoadout.ts`): resolves the
  username to a user id (404 if unknown, so a client can fall back to the
  default look) and delegates to `GetMyLoadout`. This route is public — no
  bearer token, no `banGuard`.

### Stale loadout references

A cosmetic can be deleted from the catalog (or, in practice, simply not
found) after being equipped. `GetMyLoadout.run` handles this defensively: if
`cosmetics.findById(item.cosmeticId)` returns `null` for an equipped item, the
slot is still returned in the response, but with `assets: {}` and no
`assetsExpiresAt` (`src/modules/loadout/application/GetMyLoadout.ts:24-35`).
The client is expected to treat an empty `assets` object as "nothing to
render for this slot" rather than erroring.

## Signed asset URLs

`R2AssetUrlSigner` (`src/modules/assets/infrastructure/R2AssetUrlSigner.ts`)
wraps Bun's `S3Client.presign`, which signs a SigV4 URL **locally, with no
network round-trip** — the R2 bucket stays private, and clients fetch the
binaries directly from R2 using these URLs. `signManifest(prefix, assetFiles?)`
signs every file under a cosmetic's `assetRef` prefix (falling back to
listing the bucket when `assetFiles` isn't set on the entity) and returns
`{ assets: { filename: signedUrl }, expiresAt }`.

TTL is `R2_SIGNED_URL_TTL` seconds, defaulting to **600 (10 minutes)** when
unset (`src/config/index.ts:47`, `r2.signedUrlTtlSeconds`). Every catalog
entry and loadout slot carries its own `expiresAt`; clients must re-fetch
(re-list the catalog, or re-fetch the loadout / the per-cosmetic
`GET /cosmetics/:id/assets` and `GET /me/cosmetics/:id/assets` refresh routes)
once a manifest expires rather than caching signed URLs indefinitely.
