import { describe, expect, it } from "bun:test";

import { DeleteMyAvatar } from "../../../../../src/modules/player-avatars/application/DeleteMyAvatar";
import { GetMyAvatar } from "../../../../../src/modules/player-avatars/application/GetMyAvatar";
import { SaveMyAvatar } from "../../../../../src/modules/player-avatars/application/SaveMyAvatar";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { InMemoryPlayerAvatarRepository } from "./fixtures";

describe("GetMyAvatar", () => {
	it("returns the saved config", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		avatars.rows.set("u1", { hairStyle: "bob" });
		expect(await new GetMyAvatar(avatars).run("u1")).toEqual({ config: { hairStyle: "bob" } });
	});

	it("throws NotFoundError when the player has none", async () => {
		expect(new GetMyAvatar(new InMemoryPlayerAvatarRepository()).run("u1")).rejects.toThrow(
			NotFoundError,
		);
	});
});

describe("SaveMyAvatar", () => {
	it("validates, saves and returns the config", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		const result = await new SaveMyAvatar(avatars).run({
			userId: "u1",
			config: { hairStyle: "spiky" },
		});
		expect(result).toEqual({ config: { hairStyle: "spiky" } });
		expect(avatars.rows.get("u1")).toEqual({ hairStyle: "spiky" });
	});

	it("rejects an invalid config without saving", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		expect(
			new SaveMyAvatar(avatars).run({ userId: "u1", config: { hairStyle: "Spiky!" } }),
		).rejects.toThrow(InvalidArgumentError);
		expect(avatars.rows.size).toBe(0);
	});
});

describe("DeleteMyAvatar", () => {
	it("removes the config", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		avatars.rows.set("u1", { hairStyle: "bob" });
		await new DeleteMyAvatar(avatars).run("u1");
		expect(avatars.rows.has("u1")).toBe(false);
	});

	it("succeeds when there is nothing to delete", async () => {
		await new DeleteMyAvatar(new InMemoryPlayerAvatarRepository()).run("u1");
	});
});
