import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { In } from "typeorm";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { PlayerAvatarEntity } from "../../../../../src/modules/player-avatars/infrastructure/PlayerAvatarEntity";
import { PlayerAvatarPostgresRepository } from "../../../../../src/modules/player-avatars/infrastructure/PlayerAvatarPostgresRepository";

const restore: { mockRestore(): void }[] = [];
afterEach(() => {
	for (const spy of restore.splice(0)) spy.mockRestore();
});

function stubRepository(methods: Record<string, unknown>) {
	const spy = spyOn(cosmeticsDataSource, "getRepository").mockReturnValue(methods as never);
	restore.push(spy);
	return spy;
}

describe("PlayerAvatarPostgresRepository", () => {
	it("saves with one INSERT ... ON CONFLICT (user_id) DO UPDATE", async () => {
		const chain: Record<string, ReturnType<typeof mock>> = {};
		for (const method of ["insert", "into", "values", "orUpdate"])
			chain[method] = mock(() => chain);
		chain.execute = mock(async () => ({}));
		restore.push(spyOn(cosmeticsDataSource, "createQueryBuilder").mockReturnValue(chain as never));

		await new PlayerAvatarPostgresRepository().save("u1", { hairStyle: "bob" });

		expect(chain.into).toHaveBeenCalledWith(PlayerAvatarEntity);
		expect(chain.values).toHaveBeenCalledWith({ userId: "u1", config: { hairStyle: "bob" } });
		expect(chain.orUpdate).toHaveBeenCalledWith(["config", "updated_at"], ["user_id"]);
		expect(chain.execute).toHaveBeenCalledTimes(1);
	});

	it("finds a user's config", async () => {
		stubRepository({
			findOneBy: mock(async () => ({ userId: "u1", config: { hairStyle: "bob" } })),
		});
		expect(await new PlayerAvatarPostgresRepository().findByUserId("u1")).toEqual({
			hairStyle: "bob",
		});
	});

	it("returns null when the user has no config", async () => {
		stubRepository({ findOneBy: mock(async () => null) });
		expect(await new PlayerAvatarPostgresRepository().findByUserId("u1")).toBeNull();
	});

	it("ignores a stored config that is not an object of strings", async () => {
		for (const config of [["x"], { hairStyle: 3 }]) {
			stubRepository({ findOneBy: mock(async () => ({ userId: "u1", config })) });
			expect(await new PlayerAvatarPostgresRepository().findByUserId("u1")).toBeNull();
			for (const spy of restore.splice(0)) spy.mockRestore();
		}
	});

	it("finds many users in one query and skips missing or broken ones", async () => {
		const findBy = mock(async () => [
			{ userId: "u1", config: { hairStyle: "bob" } },
			{ userId: "u3", config: ["broken"] },
		]);
		stubRepository({ findBy });

		const result = await new PlayerAvatarPostgresRepository().findByUserIds(["u1", "u2", "u3"]);

		expect(findBy).toHaveBeenCalledTimes(1);
		expect(findBy).toHaveBeenCalledWith({ userId: In(["u1", "u2", "u3"]) });
		expect([...result.entries()]).toEqual([["u1", { hairStyle: "bob" }]]);
	});

	it("does not query for an empty list", async () => {
		const findBy = mock(async () => []);
		stubRepository({ findBy });
		expect((await new PlayerAvatarPostgresRepository().findByUserIds([])).size).toBe(0);
		expect(findBy).not.toHaveBeenCalled();
	});

	it("deletes a user's row", async () => {
		const remove = mock(async () => ({}));
		stubRepository({ delete: remove });
		await new PlayerAvatarPostgresRepository().delete("u1");
		expect(remove).toHaveBeenCalledWith({ userId: "u1" });
	});
});
