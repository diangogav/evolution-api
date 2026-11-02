// Public surface of the catalog module. Other modules import from here, never from
// its folders; see the module boundaries section of docs/architecture.md.

export type { CatalogChangeNotifier } from "./domain/CatalogChangeNotifier";
export { Cosmetic } from "./domain/Cosmetic";
export type { CosmeticRepository } from "./domain/CosmeticRepository";
export { CosmeticTier } from "./domain/CosmeticTier";
export { CosmeticType, isEquippableType } from "./domain/CosmeticType";
export { EMOTE_PACK_MANIFEST } from "./domain/EmotePack";
export type { AssetUrlSigner, SignedAssetManifest } from "./domain/AssetUrlSigner";
export type { CosmeticAssetStorage, CosmeticAssetUpload } from "./domain/CosmeticAssetStorage";
