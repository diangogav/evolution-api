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
			if (url.endsWith("jtp.lflist.conf")) return "!JTP\n$whitelist\n4031928 1\n";
			return "!2010.3 Edison\n$whitelist\n910003009 1\n";
		});

		expect((await source.fetch("tcg")).label).toBe("2026.9 TCG");
		expect((await source.fetch("genesys")).label).toBe("Genesys");
		expect((await source.fetch("edison")).whitelist).toBe(true);
		expect((await source.fetch("jtp")).label).toBe("JTP");
		expect(urls).toEqual([
			"https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/tcg.lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/genesys.lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/edison.lflist.conf",
			"https://raw.githubusercontent.com/diangogav/evolution-assets/main/lflist/jtp.lflist.conf",
		]);
	});

	it("takes the TCG list evolution-assets publishes before the base list ships it", async () => {
		const source = new HttpFormatListSource(async (url) =>
			url.includes("moecube") ? "!2026.10\n1 0\n!2026.9 TCG\n2 1\n" : "!2026.10 TCG\n2 0\n",
		);

		const list = await source.fetch("tcg");

		expect(list.label).toBe("2026.10 TCG");
		expect(list.limits.get(2)).toBe(0);
	});

	it("keeps the base TCG list once it is as new as the bridge", async () => {
		const source = new HttpFormatListSource(async (url) =>
			url.includes("moecube") ? "!2026.10 TCG\n2 1\n" : "!2026.10 TCG\n2 0\n",
		);

		expect((await source.fetch("tcg")).limits.get(2)).toBe(1);
	});

	it("uses the TCG list that loads when the other source fails", async () => {
		const source = new HttpFormatListSource(async (url) => {
			if (url.includes("moecube")) throw new Error("timeout");
			return "!2026.10 TCG\n2 0\n";
		});

		expect((await source.fetch("tcg")).label).toBe("2026.10 TCG");
	});

	it("fails when no TCG source loads", async () => {
		const source = new HttpFormatListSource(async () => {
			throw new Error("offline");
		});

		await expect(source.fetch("tcg")).rejects.toThrow("offline");
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
