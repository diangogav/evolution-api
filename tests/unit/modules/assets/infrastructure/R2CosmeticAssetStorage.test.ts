import type { S3Client } from "bun";
import { describe, expect, it, mock } from "bun:test";

import { R2CosmeticAssetStorage } from "../../../../../src/modules/assets/infrastructure/R2CosmeticAssetStorage";

interface FakeR2 {
	exists?: boolean;
	written?: number;
	statSize?: number;
	listedSize?: number;
}

function fakeClient({ exists = false, written, statSize = 0, listedSize }: FakeR2) {
	const deleteObject = mock(async (_key: string) => undefined);
	const client = {
		file: (key: string) => ({
			exists: async () => exists,
			stat: async () => ({ size: statSize }),
			delete: () => deleteObject(key),
		}),
		write: async (_key: string, bytes: Uint8Array) => written ?? bytes.byteLength,
		list: async ({ prefix }: { prefix: string }) => ({
			contents: listedSize === undefined ? [] : [{ key: prefix, size: listedSize }],
		}),
		delete: (key: string) => deleteObject(key),
	};
	return { client: client as unknown as S3Client, deleteObject };
}

const upload = {
	key: "emote-packs/halloween-duelist/pack.json",
	bytes: new Uint8Array(538),
	contentType: "application/json",
};

describe("R2CosmeticAssetStorage.put", () => {
	it("accepts an upload whose listed size matches even when stat reports 0 bytes", async () => {
		const { client, deleteObject } = fakeClient({ statSize: 0, listedSize: 538 });

		await new R2CosmeticAssetStorage(client).put(upload);

		expect(deleteObject).not.toHaveBeenCalled();
	});

	it("rejects and deletes an upload whose listed size differs", async () => {
		const { client, deleteObject } = fakeClient({ listedSize: 0 });

		await expect(new R2CosmeticAssetStorage(client).put(upload)).rejects.toThrow(
			'R2 upload size mismatch for "emote-packs/halloween-duelist/pack.json": local=538, write=538, remote=0',
		);
		expect(deleteObject).toHaveBeenCalledWith(upload.key);
	});

	it("rejects and deletes an upload that is missing from the listing", async () => {
		const { client, deleteObject } = fakeClient({});

		await expect(new R2CosmeticAssetStorage(client).put(upload)).rejects.toThrow("remote=missing");
		expect(deleteObject).toHaveBeenCalledWith(upload.key);
	});

	it("rejects and deletes an upload whose write count differs", async () => {
		const { client, deleteObject } = fakeClient({ written: 10, listedSize: 538 });

		await expect(new R2CosmeticAssetStorage(client).put(upload)).rejects.toThrow("write=10");
		expect(deleteObject).toHaveBeenCalledWith(upload.key);
	});
});
