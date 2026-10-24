import { describe, expect, it } from "bun:test";

import { localize, resolveLocale } from "../../../../../src/modules/rewards/domain/LocalizedText";

describe("resolveLocale", () => {
	it("picks the first supported language from an Accept-Language header by quality order", () => {
		expect(resolveLocale("es-419,es;q=0.9,en;q=0.8")).toBe("es");
		expect(resolveLocale("en-US,en;q=0.9")).toBe("en");
		expect(resolveLocale("fr-FR,fr;q=0.9,es;q=0.5")).toBe("es");
	});

	it("falls back to English when the header is missing or unsupported", () => {
		expect(resolveLocale(undefined)).toBe("en");
		expect(resolveLocale("")).toBe("en");
		expect(resolveLocale("pt-BR")).toBe("en");
	});
});

describe("localize", () => {
	it("returns the requested language and falls back to English when it is missing", () => {
		expect(localize({ en: "Play 3 duels", es: "Juega 3 duelos" }, "es")).toBe("Juega 3 duelos");
		expect(localize({ en: "Play 3 duels" }, "es")).toBe("Play 3 duels");
	});
});
