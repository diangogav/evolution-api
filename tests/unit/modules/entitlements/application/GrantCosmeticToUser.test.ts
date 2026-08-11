import { describe, expect, it } from "bun:test";

import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GrantCosmeticToUser } from "../../../../../src/modules/entitlements/application/GrantCosmeticToUser";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import type { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";

const cosmetic = Cosmetic.create({
	id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.EXCLUSIVE,
	assetRef: "playmats/ember-vault/",
	displayName: "Ember Vault",
});

function setup(existing: Entitlement[] = []) {
	const saved: Entitlement[] = [];
	const cosmetics: CosmeticRepository = {
		findAll: async () => [cosmetic],
		findById: async (id) => (id === cosmetic.id ? cosmetic : null),
		save: async () => undefined,
	};
	const entitlements: EntitlementRepository = {
		findByUserId: async () => existing,
		save: async (entitlement) => {
			saved.push(entitlement);
		},
	};
	const grant = new GrantCosmeticToUser(cosmetics, entitlements, {
		findUserIdByUsername: async (username) => (username === "Diango" ? "user-1" : null),
	});
	return { grant, saved };
}

describe("GrantCosmeticToUser", () => {
	it("grants an exact cosmetic entitlement by username", async () => {
		const { grant, saved } = setup();
		const result = await grant.run({
			cosmeticId: cosmetic.id,
			username: " Diango ",
			source: EntitlementSource.CAMPAIGN,
		});

		expect(result).toEqual({
			cosmeticId: cosmetic.id,
			userId: "user-1",
			username: "Diango",
			source: EntitlementSource.CAMPAIGN,
			created: true,
		});
		expect(saved[0]?.grantType).toBe(GrantType.COSMETIC);
		expect(saved[0]?.grantValue).toBe(cosmetic.id);
	});

	it("is idempotent when the active grant already exists", async () => {
		const existing = Entitlement.create({
			id: crypto.randomUUID(),
			userId: "user-1",
			grantType: GrantType.COSMETIC,
			grantValue: cosmetic.id,
			source: EntitlementSource.CAMPAIGN,
			expiresAt: null,
		});
		const { grant, saved } = setup([existing]);

		const result = await grant.run({
			cosmeticId: cosmetic.id,
			username: "Diango",
			source: EntitlementSource.PURCHASE,
		});

		expect(result.created).toBe(false);
		expect(saved).toHaveLength(0);
	});

	it("rejects an unknown username", async () => {
		const { grant } = setup();
		await expect(
			grant.run({
				cosmeticId: cosmetic.id,
				username: "Nobody",
				source: EntitlementSource.CAMPAIGN,
			}),
		).rejects.toThrow('User "Nobody" not found');
	});
});
