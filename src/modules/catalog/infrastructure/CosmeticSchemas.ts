import { t } from "elysia";

import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

/** Signed asset manifest attached to a cosmetic: relative file name to a short-lived URL. */
const signedAssets = t.Record(t.String(), t.String());
const assetsExpiresAt = t.String({ description: "ISO 8601 expiry of the signed asset URLs" });

/** Entry of `GetCosmeticsCatalog`, returned by the public and personal catalog endpoints. */
export const CatalogCosmeticSchema = t.Object({
	id: t.String(),
	type: t.Enum(CosmeticType),
	tier: t.Enum(CosmeticTier),
	displayName: t.String(),
	assets: signedAssets,
	assetsExpiresAt,
});

/** Response of GET /cosmetics/ and GET /me/cosmetics/: the visible catalog, unpaginated. */
export const CosmeticCatalogSchema = t.Array(CatalogCosmeticSchema);

/** Response of GET /cosmetics/{id}/assets and GET /me/cosmetics/{id}/assets. */
export const CosmeticAssetsSchema = t.Object({
	assets: signedAssets,
	assetsExpiresAt,
});

/** Entry of `GetAdminCosmetics`, backoffice-only (includes assetRef and active). */
export const AdminCosmeticSchema = t.Object({
	id: t.String(),
	type: t.Enum(CosmeticType),
	tier: t.Enum(CosmeticTier),
	assetRef: t.String(),
	displayName: t.String(),
	active: t.Boolean(),
	assetFiles: t.Array(t.String()),
	assets: signedAssets,
	assetsExpiresAt,
});

/** Response of GET /admin/cosmetics/. */
export const AdminCosmeticCatalogSchema = t.Array(AdminCosmeticSchema);

/** Response of POST /admin/cosmetics/: the newly published cosmetic, without asset URLs. */
export const PublishedCosmeticSchema = t.Object({
	id: t.String(),
	type: t.Enum(CosmeticType),
	tier: t.Enum(CosmeticTier),
	assetRef: t.String(),
	displayName: t.String(),
	active: t.Boolean(),
	assetFiles: t.Array(t.String()),
});
