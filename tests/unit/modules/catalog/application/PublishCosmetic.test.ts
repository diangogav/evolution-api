import { describe, expect, it } from "bun:test";

import type {
	CosmeticAssetStorage,
	CosmeticAssetUpload,
} from "../../../../../src/modules/assets/domain/CosmeticAssetStorage";
import { PublishCosmetic } from "../../../../../src/modules/catalog/application/PublishCosmetic";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

function setup({ failSave = false, existing = [] as Cosmetic[] } = {}) {
	const uploads: CosmeticAssetUpload[] = [];
	const deleted: string[] = [];
	const saved: Cosmetic[] = [];
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			uploads.push(upload);
		},
		delete: async (key) => {
			deleted.push(key);
		},
	};
	const repository: CosmeticRepository = {
		findAll: async () => existing,
		findById: async () => null,
		save: async (cosmetic) => {
			if (failSave) throw new Error("database unavailable");
			saved.push(cosmetic);
		},
	};
	return { publish: new PublishCosmetic(repository, storage), uploads, deleted, saved };
}

describe("PublishCosmetic", () => {
	it("rejects a playmat that only ships a glTF model, before touching storage", async () => {
		const { publish, uploads, saved } = setup();

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.EXCLUSIVE,
				assetRef: "playmats/ember-vault/",
				displayName: "Ember Vault",
				files: [{ name: "ember-vault.glb", bytes: new Uint8Array([1, 2, 3]) }],
			}),
		).rejects.toThrow("PLAYMAT requires background.webp, background.png or background.jpg");

		expect(uploads).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});

	it("stores a playmat's stage with its real content type", async () => {
		const { publish, uploads } = setup();
		await publish.run({
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
			files: [{ name: "background.webp", bytes: new Uint8Array([1]) }],
		});

		expect(uploads.map((u) => [u.key, u.contentType])).toEqual([
			["playmats/kagura-castle/background.webp", "image/webp"],
		]);
	});

	it("rolls back uploaded objects when catalog persistence fails", async () => {
		const { publish, deleted } = setup({ failSave: true });

		await expect(
			publish.run({
				type: CosmeticType.AVATAR,
				tier: CosmeticTier.STANDARD,
				assetRef: "avatars/ember-face/",
				displayName: "Ember Face",
				files: [
					{ name: "render.jpg", bytes: new Uint8Array([1]) },
					{ name: "preview.jpg", bytes: new Uint8Array([2]) },
				],
			}),
		).rejects.toThrow("database unavailable");

		expect(deleted).toEqual(["avatars/ember-face/render.jpg", "avatars/ember-face/preview.jpg"]);
	});

	it("rejects unsafe prefixes before touching storage", async () => {
		const { publish, uploads } = setup();

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/../escape/",
				displayName: "Unsafe",
				files: [{ name: "background.webp", bytes: new Uint8Array([1]) }],
			}),
		).rejects.toThrow("assetRef");

		expect(uploads).toHaveLength(0);
	});

	it("rejects a duplicate catalog prefix", async () => {
		const existing = Cosmetic.create({
			id: crypto.randomUUID(),
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/existing/",
			displayName: "Existing",
		});
		const { publish } = setup({ existing: [existing] });

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/existing/",
				displayName: "Duplicate",
				files: [{ name: "background.webp", bytes: new Uint8Array([1]) }],
			}),
		).rejects.toThrow("already uses assetRef");
	});

	// Lanes are zone plates — a cosmetic of their own, so any stage pairs with
	// any lane. The manifest is the whole asset.
	describe("LANE", () => {
		const encoder = new TextEncoder();
		const plate = (manifest: unknown) => encoder.encode(JSON.stringify(manifest));
		const valid = { version: 1, base: "#c98a3a", accent: "#f0c070", rim: "#8a5a2a" };
		const lane = (files: { name: string; bytes: Uint8Array }[]) => ({
			type: CosmeticType.LANE,
			tier: CosmeticTier.STANDARD,
			assetRef: "lanes/bronze/",
			displayName: "Bronce",
			files,
		});

		it("stores a valid plate.json under the lane's prefix", async () => {
			const { publish, uploads, saved } = setup();

			const result = await publish.run(lane([{ name: "plate.json", bytes: plate(valid) }]));

			expect(result.assetFiles).toEqual(["plate.json"]);
			expect(uploads[0]?.key).toBe("lanes/bronze/plate.json");
			expect(uploads[0]?.contentType).toBe("application/json");
			expect(saved[0]?.type).toBe(CosmeticType.LANE);
		});

		it("rejects a differently cased plate.json, since the client fetches the exact key", async () => {
			const { publish, uploads } = setup();

			await expect(
				publish.run(lane([{ name: "Plate.JSON", bytes: plate(valid) }])),
			).rejects.toThrow("LANE requires exactly one file: plate.json");

			expect(uploads).toHaveLength(0);
		});

		it("rejects a lane without plate.json, before touching storage", async () => {
			const { publish, uploads } = setup();

			await expect(
				publish.run(lane([{ name: "frame.webp", bytes: new Uint8Array([1]) }])),
			).rejects.toThrow("LANE requires exactly one file: plate.json");

			expect(uploads).toHaveLength(0);
		});

		it("rejects any extra file next to plate.json", async () => {
			const { publish, uploads } = setup();

			await expect(
				publish.run(
					lane([
						{ name: "plate.json", bytes: plate(valid) },
						{ name: "frame.webp", bytes: new Uint8Array([1]) },
					]),
				),
			).rejects.toThrow("LANE requires exactly one file: plate.json");

			expect(uploads).toHaveLength(0);
		});

		it("rejects a bad colour, before touching storage", async () => {
			const { publish, uploads, saved } = setup();

			await expect(
				publish.run(lane([{ name: "plate.json", bytes: plate({ ...valid, base: "red" }) }])),
			).rejects.toThrow("plate.json base must be a #rrggbb colour");

			expect(uploads).toHaveLength(0);
			expect(saved).toHaveLength(0);
		});

		it("rejects a plate.json that is not JSON", async () => {
			const { publish } = setup();

			await expect(
				publish.run(lane([{ name: "plate.json", bytes: encoder.encode("{nope") }])),
			).rejects.toThrow("plate.json is not valid JSON");
		});
	});

	it("keeps lanes out of the playmat prefix", async () => {
		const { publish } = setup();

		await expect(
			publish.run({
				type: CosmeticType.LANE,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/stone/",
				displayName: "Losa de piedra",
				files: [{ name: "plate.json", bytes: new Uint8Array([1]) }],
			}),
		).rejects.toThrow("assetRef for LANE must match lanes/kebab-case-slug/");
	});
	describe("AMBIENCE", () => {
		const encoder = new TextEncoder();
		const manifest = (value: unknown) => encoder.encode(JSON.stringify(value));
		const valid = {
			version: 1,
			motes: [{ shape: "ember", colors: ["#ff8a3d", "#ffb347"], share: 0.8 }],
			sweep: "#ffb380",
		};
		const ambience = (files: { name: string; bytes: Uint8Array }[]) => ({
			type: CosmeticType.AMBIENCE,
			tier: CosmeticTier.STANDARD,
			assetRef: "ambience/embers/",
			displayName: "Brasas",
			files,
		});

		it("stores a valid ambience.json under the ambience prefix", async () => {
			const { publish, uploads, saved } = setup();

			const result = await publish.run(
				ambience([{ name: "ambience.json", bytes: manifest(valid) }]),
			);

			expect(result.assetFiles).toEqual(["ambience.json"]);
			expect(uploads[0]?.key).toBe("ambience/embers/ambience.json");
			expect(uploads[0]?.contentType).toBe("application/json");
			expect(saved[0]?.type).toBe(CosmeticType.AMBIENCE);
		});

		it("rejects a wrongly named file, before touching storage", async () => {
			const { publish, uploads } = setup();

			await expect(
				publish.run(ambience([{ name: "Ambience.JSON", bytes: manifest(valid) }])),
			).rejects.toThrow("AMBIENCE requires exactly one file: ambience.json");

			expect(uploads).toHaveLength(0);
		});

		it("rejects any extra file next to ambience.json", async () => {
			const { publish, uploads } = setup();

			await expect(
				publish.run(
					ambience([
						{ name: "ambience.json", bytes: manifest(valid) },
						{ name: "extra.webp", bytes: new Uint8Array([1]) },
					]),
				),
			).rejects.toThrow("AMBIENCE requires exactly one file: ambience.json");

			expect(uploads).toHaveLength(0);
		});

		it("rejects an invalid manifest, before touching storage", async () => {
			const { publish, uploads, saved } = setup();

			await expect(
				publish.run(
					ambience([
						{
							name: "ambience.json",
							bytes: manifest({
								...valid,
								motes: [{ shape: "star", colors: ["#ffffff"], share: 1 }],
							}),
						},
					]),
				),
			).rejects.toThrow("ambience.json motes[0].shape");

			expect(uploads).toHaveLength(0);
			expect(saved).toHaveLength(0);
		});

		it("keeps ambience out of other prefixes", async () => {
			const { publish } = setup();

			await expect(
				publish.run({
					...ambience([{ name: "ambience.json", bytes: manifest(valid) }]),
					assetRef: "lanes/embers/",
				}),
			).rejects.toThrow("assetRef for AMBIENCE must match ambience/kebab-case-slug/");
		});
	});

	describe("EMOTE_PACK", () => {
		const encoder = new TextEncoder();
		const lottie = encoder.encode(
			JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [] }),
		);
		const pack = (keys: string[]) => [
			{
				name: "pack.json",
				bytes: encoder.encode(
					JSON.stringify({
						version: 1,
						emotes: keys.map((key) => ({ key, label: key, file: `${key}.json` })),
					}),
				),
			},
			...keys.map((key) => ({ name: `${key}.json`, bytes: lottie })),
		];
		const emotePack = (files: ReturnType<typeof pack>, assetRef = "emote-packs/halloween/") => ({
			type: CosmeticType.EMOTE_PACK,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef,
			displayName: "Halloween Duelist",
			files,
		});

		it("publishes pack.json and its Lottie files under emote-packs/<slug>/", async () => {
			const { publish, uploads, saved } = setup();

			const result = await publish.run(emotePack(pack(["attack", "ghost-wave"])));

			expect(uploads.map((upload) => [upload.key, upload.contentType])).toEqual([
				["emote-packs/halloween/pack.json", "application/json"],
				["emote-packs/halloween/attack.json", "application/json"],
				["emote-packs/halloween/ghost-wave.json", "application/json"],
			]);
			expect(result.assetFiles).toEqual(["pack.json", "attack.json", "ghost-wave.json"]);
			expect(saved).toHaveLength(1);
		});

		it("accepts 13 files: pack.json plus 12 emotes", async () => {
			const { publish, uploads } = setup();
			const keys = Array.from({ length: 12 }, (_, index) => `e${index}`);

			await publish.run(emotePack(pack(keys)));

			expect(uploads).toHaveLength(13);
		});

		it("keeps the 8 file limit for other types", async () => {
			const { publish } = setup();
			const files = Array.from({ length: 9 }, (_, index) => ({
				name: `f${index}.png`,
				bytes: new Uint8Array([1]),
			}));

			await expect(
				publish.run({
					type: CosmeticType.LANE,
					tier: CosmeticTier.STANDARD,
					assetRef: "lanes/bronze/",
					displayName: "Bronce",
					files,
				}),
			).rejects.toThrow("A cosmetic requires between 1 and 8 files");
		});

		it("rejects a pack with an invalid manifest or Lottie, before touching storage", async () => {
			const { publish, uploads, saved } = setup();
			const files = pack(["attack"]);
			files[1] = { name: "attack.json", bytes: encoder.encode('{"v":"5.7.4"}') };

			await expect(publish.run(emotePack(files))).rejects.toThrow(
				"attack.json requires a frame rate fr greater than 0",
			);

			expect(uploads).toHaveLength(0);
			expect(saved).toHaveLength(0);
		});

		it("rejects an assetRef outside emote-packs/<slug>/", async () => {
			const { publish } = setup();

			await expect(publish.run(emotePack(pack(["attack"]), "lanes/halloween/"))).rejects.toThrow(
				"assetRef for EMOTE_PACK must match emote-packs/kebab-case-slug/",
			);
		});

		it("rejects an emote ref over 48 bytes using the slug from the assetRef", async () => {
			const { publish } = setup();
			const slug = "s".repeat(30);

			await expect(
				publish.run(emotePack(pack(["k".repeat(19)]), `emote-packs/${slug}/`)),
			).rejects.toThrow("exceeds 48 bytes");
		});
	});
});
