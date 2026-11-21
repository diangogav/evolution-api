import { describe, expect, it } from "bun:test";

import {
	GetAvatarsByUserIds,
	MAX_AVATAR_LOOKUP,
} from "../../../../../src/modules/player-avatars/application/GetAvatarsByUserIds";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { InMemoryPlayerAvatarRepository } from "./fixtures";

describe("GetAvatarsByUserIds", () => {
	it("returns avatars in request order and skips users without one", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		avatars.rows.set("a", { hairStyle: "bob" });
		avatars.rows.set("c", { hairStyle: "afro" });

		expect(await new GetAvatarsByUserIds(avatars).run("c,b,a")).toEqual({
			avatars: [
				{ userId: "c", config: { hairStyle: "afro" } },
				{ userId: "a", config: { hairStyle: "bob" } },
			],
		});
	});

	it("trims, de-duplicates and drops blank ids", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		await new GetAvatarsByUserIds(avatars).run(" a,,b, a ");
		expect(avatars.lookups).toEqual([["a", "b"]]);
	});

	it(`rejects more than ${MAX_AVATAR_LOOKUP} ids`, async () => {
		const ids = (count: number) => Array.from({ length: count }, (_, i) => `u${i}`).join(",");
		const useCase = new GetAvatarsByUserIds(new InMemoryPlayerAvatarRepository());
		expect(useCase.run(ids(MAX_AVATAR_LOOKUP + 1))).rejects.toThrow(InvalidArgumentError);
		expect(await useCase.run(ids(MAX_AVATAR_LOOKUP))).toEqual({ avatars: [] });
	});

	it("returns an empty list without querying when no ids are left", async () => {
		const avatars = new InMemoryPlayerAvatarRepository();
		expect(await new GetAvatarsByUserIds(avatars).run(" , ")).toEqual({ avatars: [] });
		expect(avatars.lookups).toEqual([]);
	});
});
