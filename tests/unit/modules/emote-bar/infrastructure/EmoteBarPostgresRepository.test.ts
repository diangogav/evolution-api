import { describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { EmoteBar } from "../../../../../src/modules/emote-bar/domain/EmoteBar";
import { DEFAULT_EMOTE_IDS } from "../../../../../src/modules/emote-bar/domain/EmoteRef";
import { EmoteBarPostgresRepository } from "../../../../../src/modules/emote-bar/infrastructure/EmoteBarPostgresRepository";
import { UserEmoteBarEntity } from "../../../../../src/modules/emote-bar/infrastructure/UserEmoteBarEntity";

function stubUpsertChain() {
	const chain: Record<string, ReturnType<typeof mock>> = {};
	for (const method of ["insert", "into", "values", "orUpdate"]) {
		chain[method] = mock(() => chain);
	}
	chain.execute = mock(async () => ({}));
	const spy = spyOn(cosmeticsDataSource, "createQueryBuilder").mockReturnValue(chain as never);
	return { chain, spy };
}

describe("EmoteBarPostgresRepository", () => {
	it("saves the bar with one INSERT ... ON CONFLICT (user_id) DO UPDATE statement", async () => {
		const { chain, spy } = stubUpsertChain();
		const repository = spyOn(cosmeticsDataSource, "getRepository").mockImplementation(() => {
			throw new Error("save must not go through a SELECT-then-write repository");
		});

		await new EmoteBarPostgresRepository().save("user-1", EmoteBar.defaults());

		expect(chain.into).toHaveBeenCalledWith(UserEmoteBarEntity);
		expect(chain.values).toHaveBeenCalledWith({
			userId: "user-1",
			emoteRefs: [...DEFAULT_EMOTE_IDS],
		});
		expect(chain.orUpdate).toHaveBeenCalledWith(["emote_refs", "updated_at"], ["user_id"]);
		expect(chain.execute).toHaveBeenCalledTimes(1);

		spy.mockRestore();
		repository.mockRestore();
	});

	it("returns null when the user never saved a bar", async () => {
		const spy = spyOn(cosmeticsDataSource, "getRepository").mockReturnValue({
			findOneBy: mock(async () => null),
		} as never);

		expect(await new EmoteBarPostgresRepository().findByUserId("user-1")).toBeNull();

		spy.mockRestore();
	});

	it("returns the stored refs as they are, even when they no longer validate", async () => {
		const emoteRefs = ["removed-default", "Not/A/Ref", "wave", "wave", "a", "b", "c", "d"];
		const spy = spyOn(cosmeticsDataSource, "getRepository").mockReturnValue({
			findOneBy: mock(async () => ({ userId: "user-1", emoteRefs })),
		} as never);

		expect(await new EmoteBarPostgresRepository().findByUserId("user-1")).toEqual(emoteRefs);

		spy.mockRestore();
	});

	it("reads a stored array of the wrong length as no saved bar", async () => {
		const spy = spyOn(cosmeticsDataSource, "getRepository").mockReturnValue({
			findOneBy: mock(async () => ({ userId: "user-1", emoteRefs: ["wave"] })),
		} as never);

		expect(await new EmoteBarPostgresRepository().findByUserId("user-1")).toBeNull();

		spy.mockRestore();
	});
});
