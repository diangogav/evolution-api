export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Player-facing copy stored with the data it describes. English is mandatory and is the
// fallback; other languages are optional per row.
export type LocalizedText = { en: string } & Partial<Record<Locale, string>>;

export function localize(text: LocalizedText, locale: Locale): string {
	return text[locale] ?? text.en;
}

// Resolves the best supported locale from an Accept-Language header. Regional tags
// (es-419, en-US) map to their language; order follows the header's quality values.
export function resolveLocale(acceptLanguage: string | undefined): Locale {
	if (!acceptLanguage) return DEFAULT_LOCALE;

	const ranked = acceptLanguage
		.split(",")
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params
				.map((p) => p.trim())
				.find((p) => p.startsWith("q="))
				?.slice(2);
			return { language: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1, index };
		})
		.sort((a, b) => b.q - a.q || a.index - b.index);

	const match = ranked.find((r) => (SUPPORTED_LOCALES as readonly string[]).includes(r.language));
	return (match?.language as Locale | undefined) ?? DEFAULT_LOCALE;
}
