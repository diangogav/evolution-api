import { beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { createSwagger } from "../../../../src/server/swagger";

type ScalarConfiguration = {
	theme?: string;
	layout?: string;
	darkMode?: boolean;
	defaultOpenAllTags?: boolean;
	favicon?: string;
	customCss?: string;
	authentication?: { preferredSecurityScheme?: string };
};

describe("Scalar API reference page", () => {
	let html: string;
	let configuration: ScalarConfiguration;

	beforeAll(async () => {
		const app = new Elysia().use(createSwagger());
		const response = await app.handle(new Request("http://localhost/swagger"));
		html = await response.text();
		// The plugin embeds the configuration inside a single-quoted attribute,
		// so it must parse back intact (no stray single quotes in the CSS).
		const embedded = html.match(/data-configuration='([^']*)'/)?.[1] ?? "{}";
		configuration = JSON.parse(embedded) as ScalarConfiguration;
	});

	it("renders the Evolution brand theme instead of the bundled Elysia one", () => {
		expect(configuration.theme).toBe("none");
		expect(configuration.customCss).toContain("--scalar-color-accent: #883aea");
		expect(configuration.customCss).toContain("--scalar-background-1: #13151a");
		expect(html).toContain("--scalar-color-accent: #883aea");
	});

	it("opens in dark mode with the modern layout and collapsed tags", () => {
		expect(configuration.darkMode).toBe(true);
		expect(configuration.layout).toBe("modern");
		expect(configuration.defaultOpenAllTags).toBe(false);
	});

	it("uses the Evolution favicon and preselects the bearer scheme", () => {
		expect(configuration.favicon).toBe("https://evolutionygo.com/favicon.ico");
		expect(configuration.authentication?.preferredSecurityScheme).toBe("bearerAuth");
	});
});
