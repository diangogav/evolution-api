import { describe, expect, it } from "bun:test";

import {
	CARD_ALTERNATES_URL,
	HttpCardAlternatesSource,
} from "../../../../../src/modules/community-decks/infrastructure/HttpCardAlternatesSource";
import { HttpFormatListSource } from "../../../../../src/modules/community-decks/infrastructure/HttpFormatListSource";

describe("HttpFormatListSource", () => {
	it("reads each list from the file the client uses", async () => {
		const urls: string[] = [];
		const source = new HttpFormatListSource(async (url) => {
			urls.push(url);
			if (url.endsWith("lflist.conf") && url.includes("moecube"))
				return "!2026.10\n1 0\n!2026.9 TCG\n2 1\n";
			if (url.endsWith("genesys.lflist.conf")) return "!Genesys\n3 3 10\n";
			return "!2010.3 Edison\n$whitelist\n910003009 1\n";
		});

		expect((await source.fetch("tcg")).label).toBe("2026.9 TCG");
		expect((await source.fetch("genesys")).label).toBe("Genesys");
		expect((await source.fetch("edison")).whitelist).toBe(true);
		expect(urls).toEqual([
			"https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/genesys.lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/edison.lflist.conf",
		]);
	});

	it("fails when the file lacks the section", async () => {
		const source = new HttpFormatListSource(async () => "!Something else\n");

		await expect(source.fetch("genesys")).rejects.toThrow("No genesys section");
	});
});

describe("HttpCardAlternatesSource", () => {
	it("reads the evolution-assets alternates map", async () => {
		let requested = "";
		const source = new HttpCardAlternatesSource(async (url) => {
			requested = url;
			return { version: 1, alternates: { "29071332": ["910003009"] } };
		});

		expect(await source.fetch()).toEqual(new Map([[29071332, [910003009]]]));
		expect(requested).toBe(CARD_ALTERNATES_URL);
	});
});
