import { UnprocessableError } from "../../../shared/errors/UnprocessableError";

export const PUSH_LOCALES = ["en", "es"] as const;

export type PushLocale = (typeof PUSH_LOCALES)[number];

export const MAX_ENDPOINT_LENGTH = 2048;
// Column widths of `push_subscriptions`: a P-256 public key is 87 base64url characters and
// the auth secret 22, so the columns leave room for padding.
export const MAX_P256DH_LENGTH = 128;
export const MAX_AUTH_LENGTH = 64;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** One browser install that accepted Web Push for a user. */
export type PushSubscription = {
	userId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	locale: PushLocale;
};

/** Any Spanish variant (`es`, `es-AR`, `es_419`) reads Spanish; everything else English. */
export function normalizePushLocale(locale: string | null | undefined): PushLocale {
	return locale?.trim().toLowerCase().startsWith("es") ? "es" : "en";
}

export function pushSubscription(input: {
	userId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	locale?: string | null;
}): PushSubscription {
	if (!isPushEndpoint(input.endpoint)) {
		throw new UnprocessableError(
			`Invalid push subscription: endpoint must be an https URL of at most ${MAX_ENDPOINT_LENGTH} characters`,
		);
	}
	if (!isBase64Url(input.p256dh, MAX_P256DH_LENGTH)) {
		throw new UnprocessableError("Invalid push subscription: keys.p256dh must be base64url");
	}
	if (!isBase64Url(input.auth, MAX_AUTH_LENGTH)) {
		throw new UnprocessableError("Invalid push subscription: keys.auth must be base64url");
	}
	return {
		userId: input.userId,
		endpoint: input.endpoint,
		p256dh: input.p256dh,
		auth: input.auth,
		locale: normalizePushLocale(input.locale),
	};
}

export function isPushEndpoint(endpoint: string): boolean {
	if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
	try {
		return new URL(endpoint).protocol === "https:";
	} catch {
		return false;
	}
}

function isBase64Url(value: string, maxLength: number): boolean {
	return value.length <= maxLength && BASE64URL.test(value);
}
