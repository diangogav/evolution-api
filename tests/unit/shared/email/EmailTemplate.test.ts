import { describe, expect, it } from "bun:test";

import { renderBrandedEmail } from "../../../../src/shared/email/EmailTemplate";

describe("renderBrandedEmail", () => {
	it("includes the heading in html and text", () => {
		const { html, text } = renderBrandedEmail({
			heading: "Hello, Duelist!",
			paragraphs: ["Welcome aboard."],
		});

		expect(html).toContain("Hello, Duelist!");
		expect(text).toContain("Hello, Duelist!");
	});

	it("includes each paragraph in html and text", () => {
		const paragraphs = ["First line here.", "Second line here."];
		const { html, text } = renderBrandedEmail({ heading: "Test", paragraphs });

		for (const p of paragraphs) {
			expect(html).toContain(p);
			expect(text).toContain(p);
		}
	});

	it("renders the EVOLUTION wordmark in the html header", () => {
		const { html } = renderBrandedEmail({ heading: "Test", paragraphs: [] });

		expect(html).toContain("EVOLUTION");
	});

	it("renders the CTA button with label and url when provided", () => {
		const cta = { label: "Open Evolution YGO", url: "https://evolutionygo.com" };
		const { html, text } = renderBrandedEmail({ heading: "Test", paragraphs: [], cta });

		expect(html).toContain(cta.label);
		expect(html).toContain(cta.url);
		expect(text).toContain(`${cta.label}: ${cta.url}`);
	});

	it("omits CTA markup when no cta is passed", () => {
		const { html, text } = renderBrandedEmail({ heading: "Test", paragraphs: ["Only paragraph."] });

		// The bulletproof button pattern (display:inline-block) is CTA-only; footer uses a plain <a>
		expect(html).not.toContain("display:inline-block");
		// Plain text footer uses " — " not ": ", so no ": http" appears without a CTA
		expect(text).not.toContain(": http");
	});

	it("produces plain text with no HTML tags", () => {
		const { text } = renderBrandedEmail({
			heading: "Hello",
			paragraphs: ["Para one.", "Para two."],
			cta: { label: "Go here", url: "https://evolutionygo.com" },
		});

		expect(text).not.toMatch(/<[a-z][^>]*>/i);
	});

	it("includes the evolutionygo.com footer in both outputs", () => {
		const { html, text } = renderBrandedEmail({ heading: "Test", paragraphs: [] });

		expect(html).toContain("evolutionygo.com");
		expect(text).toContain("https://evolutionygo.com");
	});
});
