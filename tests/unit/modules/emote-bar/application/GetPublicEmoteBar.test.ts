import { describe, expect, it } from "bun:test";

import { GetPublicEmoteBar } from "../../../../../src/modules/emote-bar/application/GetPublicEmoteBar";
import { EmoteBarView } from "../../../../../src/modules/emote-bar/application/GetMyEmoteBar";
import { UserDirectory } from "../../../../../src/modules/loadout/domain/UserDirectory";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const view: EmoteBarView = {
	slots: [{ ref: "thumbsup", packId: null, assetUrl: null, packUrl: null, assetsExpiresAt: null }],
};

function build(directory: UserDirectory) {
	const resolvedFor: string[] = [];
	const useCase = new GetPublicEmoteBar(directory, {
		run: async (userId: string) => {
			resolvedFor.push(userId);
			return view;
		},
	});
	return { useCase, resolvedFor };
}

describe("GetPublicEmoteBar", () => {
	it("resolves the bar of the user found by username", async () => {
		const { useCase, resolvedFor } = build({
			findUserIdByUsername: async (username) => (username === "rival" ? "user-rival" : null),
		});

		expect(await useCase.run("rival")).toBe(view);
		expect(resolvedFor).toEqual(["user-rival"]);
	});

	it("throws NotFound when the username does not exist", async () => {
		const { useCase, resolvedFor } = build({ findUserIdByUsername: async () => null });

		await expect(useCase.run("ghost")).rejects.toBeInstanceOf(NotFoundError);
		expect(resolvedFor).toEqual([]);
	});
});
