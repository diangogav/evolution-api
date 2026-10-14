import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";
import { EmoteBar } from "../../../../../src/modules/emote-bar/domain/EmoteBar";
import { EmoteBarRepository } from "../../../../../src/modules/emote-bar/domain/EmoteBarRepository";

export const PACK_ID = "pack-1";

export function pack(overrides: Partial<Parameters<typeof Cosmetic.from>[0]> = {}): Cosmetic {
	return Cosmetic.from({
		id: PACK_ID,
		type: CosmeticType.EMOTE_PACK,
		tier: CosmeticTier.DONOR,
		assetRef: "emote-packs/halloween/",
		displayName: "Halloween",
		active: true,
		assetFiles: ["pack.json", "ghost.json", "bat.json"],
		...overrides,
	});
}

export function grant(cosmeticId: string, expiresAt: Date | null = null): Entitlement {
	return Entitlement.create({
		id: `grant-${cosmeticId}`,
		userId: "user-1",
		grantType: GrantType.COSMETIC,
		grantValue: cosmeticId,
		source: EntitlementSource.CAMPAIGN,
		expiresAt,
	});
}

export function cosmeticsOf(...items: Cosmetic[]): CosmeticRepository {
	return {
		findAll: async () => items,
		findById: async (id) => items.find((item) => item.id === id) ?? null,
		save: async () => undefined,
	};
}

export function gatekeeperOf(...entitlements: Entitlement[]): EntitlementsGatekeeper {
	return new EntitlementsGatekeeper({
		findByUserId: async () => entitlements,
		save: async () => undefined,
	});
}

export function barsOf(initial: EmoteBar | null) {
	const saved: Array<{ userId: string; bar: EmoteBar }> = [];
	const repository: EmoteBarRepository = {
		findByUserId: async () => initial,
		save: async (userId, bar) => {
			saved.push({ userId, bar });
		},
	};
	return { repository, saved };
}

export const signer: AssetUrlSigner = {
	sign: () => "",
	signMany: () => ({}),
	signManifest: async (prefix, files) => ({
		assets: Object.fromEntries((files ?? []).map((file) => [file, `signed:${prefix}${file}`])),
		expiresAt: "2030-01-01T00:00:00.000Z",
	}),
};
