import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { PrizeTier } from "../domain/EventDefinition";

export type PrizeCosmeticView = {
	id: string;
	type: CosmeticType;
	name: string;
	assets: Record<string, string>;
	assetsExpiresAt?: string | null;
};

export type PrizeTierView = PrizeTier & { cosmetics: PrizeCosmeticView[] };

// Prize cosmetics are described whatever their tier or the viewer's access: the point is to
// show what a run can win, and EXCLUSIVE ones are exactly what events give away. An id the
// catalog no longer knows is left out of `cosmetics` but stays in `cosmeticIds`.
export async function toPrizeTierViews(
	tiers: PrizeTier[],
	cosmetics: Pick<CosmeticRepository, "findById">,
	signer: Pick<AssetUrlSigner, "signManifest">,
): Promise<PrizeTierView[]> {
	const ids = [...new Set(tiers.flatMap((tier) => tier.cosmeticIds))];
	const described = await Promise.all(ids.map((id) => describePrize(id, cosmetics, signer)));
	const byId = new Map(ids.map((id, index) => [id, described[index]]));

	return tiers.map((tier) => ({
		...tier,
		cosmetics: tier.cosmeticIds.flatMap((id) => byId.get(id) ?? []),
	}));
}

async function describePrize(
	id: string,
	cosmetics: Pick<CosmeticRepository, "findById">,
	signer: Pick<AssetUrlSigner, "signManifest">,
): Promise<PrizeCosmeticView | null> {
	const cosmetic = await cosmetics.findById(id);
	if (!cosmetic) return null;
	const manifest = await signer.signManifest(cosmetic.assetRef, cosmetic.assetFiles ?? undefined);
	return {
		id: cosmetic.id,
		type: cosmetic.type,
		name: cosmetic.displayName,
		assets: manifest.assets,
		assetsExpiresAt: manifest.expiresAt,
	};
}
