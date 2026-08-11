import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type { CosmeticAssetStorage } from "../../../../src/modules/assets/domain/CosmeticAssetStorage";
import { PublishCosmetic } from "../../../../src/modules/catalog/application/PublishCosmetic";
import type { CosmeticRepository } from "../../../../src/modules/catalog/domain/CosmeticRepository";
import type { EntitlementRepository } from "../../../../src/modules/entitlements/domain/EntitlementRepository";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { createAdminCosmeticsRouter } from "../../../../src/server/routes/admin-cosmetics-router";

function buildApp() {
	const cosmetics: CosmeticRepository = {
		findAll: async () => [],
		findById: async () => null,
		save: async () => undefined,
	};
	const storage: CosmeticAssetStorage = {
		put: async () => undefined,
		delete: async () => undefined,
	};
	const entitlements: EntitlementRepository = {
		findByUserId: async () => [],
		save: async () => undefined,
	};
	return new Elysia()
		.onError(({ error, set }) => {
			if (error instanceof AuthenticationError) set.status = 401;
			if (error instanceof ForbiddenError) set.status = 403;
		})
		.use(
			createAdminCosmeticsRouter({
				authorizer: {
					requireAdmin: (token) => {
						if (!token) throw new AuthenticationError("missing");
						if (token !== "admin-token") throw new ForbiddenError("admin required");
						return { userId: "admin-1" };
					},
				},
				cosmetics,
				publish: new PublishCosmetic(cosmetics, storage),
				entitlements,
				users: { findUserIdByUsername: async () => null },
			}),
		);
}

describe("admin cosmetics routes", () => {
	it("rejects an unauthenticated catalog request", async () => {
		const response = await buildApp().handle(new Request("http://localhost/admin/cosmetics/"));
		expect(response.status).toBe(401);
	});

	it("rejects a non-admin bearer token", async () => {
		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				headers: { Authorization: "Bearer user-token" },
			}),
		);
		expect(response.status).toBe(403);
	});

	it("allows an administrator to list the catalog", async () => {
		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				headers: { Authorization: "Bearer admin-token" },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("accepts a multipart playmat publication from an administrator", async () => {
		const form = new FormData();
		form.set("type", "PLAYMAT");
		form.set("tier", "EXCLUSIVE");
		form.set("assetRef", "playmats/ember-vault/");
		form.set("displayName", "Ember Vault");
		form.append("files", new File([new Uint8Array([1, 2, 3])], "ember-vault.glb"));

		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				method: "POST",
				headers: { Authorization: "Bearer admin-token" },
				body: form,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			type: "PLAYMAT",
			assetRef: "playmats/ember-vault/",
			active: true,
			assetFiles: ["ember-vault.glb"],
		});
	});
});
