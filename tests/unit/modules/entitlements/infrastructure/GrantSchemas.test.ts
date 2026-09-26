import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GrantCosmeticToUser } from "../../../../../src/modules/entitlements/application/GrantCosmeticToUser";
import type { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { CosmeticGrantSchema } from "../../../../../src/modules/entitlements/infrastructure/GrantSchemas";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const cosmetic = Cosmetic.create({
	id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.EXCLUSIVE,
	assetRef: "playmats/ember-vault/",
	displayName: "Ember Vault",
});

function build() {
	const cosmetics: CosmeticRepository = {
		findAll: async () => [cosmetic],
		findById: async (id) => (id === cosmetic.id ? cosmetic : null),
		save: async () => undefined,
	};
	const saved: Parameters<EntitlementRepository["save"]>[0][] = [];
	const entitlements: EntitlementRepository = {
		findByUserId: async () => saved,
		save: async (entitlement) => {
			saved.push(entitlement);
		},
	};
	return new GrantCosmeticToUser(cosmetics, entitlements, {
		findUserIdByUsername: async (username) => (username === "Diango" ? "user-1" : null),
	});
}

describe("CosmeticGrantSchema", () => {
	it("accepts what GrantCosmeticToUser returns for a fresh grant", async () => {
		const result = await build()
			.run({ cosmeticId: cosmetic.id, username: "Diango", source: EntitlementSource.CAMPAIGN })
			.then(wire);

		expect(Value.Check(CosmeticGrantSchema, result)).toBe(true);
	});

	it("accepts the idempotent response with created: false", async () => {
		const grant = build();
		await grant.run({
			cosmeticId: cosmetic.id,
			username: "Diango",
			source: EntitlementSource.CAMPAIGN,
		});
		const result = await grant
			.run({ cosmeticId: cosmetic.id, username: "Diango", source: EntitlementSource.PURCHASE })
			.then(wire);

		expect((result as { created: boolean }).created).toBe(false);
		expect(Value.Check(CosmeticGrantSchema, result)).toBe(true);
	});
});
