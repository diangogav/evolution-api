import { describe, expect, it } from "bun:test";

import {
	normalizePushLocale,
	pushSubscription,
} from "../../../../../src/modules/push/domain/PushSubscription";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";

const P256DH =
	"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

const valid = {
	userId: "u-1",
	endpoint: "https://fcm.googleapis.com/fcm/send/abc:APA91b",
	p256dh: P256DH,
	auth: AUTH,
	locale: "es-AR",
};

describe("pushSubscription", () => {
	it("keeps a valid subscription and normalises its locale", () => {
		expect(pushSubscription(valid)).toEqual({ ...valid, locale: "es" });
	});

	it("accepts padded base64url keys", () => {
		expect(pushSubscription({ ...valid, auth: `${AUTH}==` }).auth).toBe(`${AUTH}==`);
	});

	it.each([
		["http://push.example.com/abc"],
		["not a url"],
		[""],
		[`https://push.example.com/${"a".repeat(2048)}`],
	])("rejects the endpoint %p", (endpoint) => {
		expect(() => pushSubscription({ ...valid, endpoint })).toThrow(UnprocessableError);
	});

	it("rejects keys outside the base64url alphabet", () => {
		expect(() => pushSubscription({ ...valid, p256dh: "abc+/def" })).toThrow(UnprocessableError);
		expect(() => pushSubscription({ ...valid, auth: "has space" })).toThrow(UnprocessableError);
	});

	it("rejects keys longer than their columns", () => {
		expect(() => pushSubscription({ ...valid, p256dh: "a".repeat(129) })).toThrow(
			UnprocessableError,
		);
		expect(() => pushSubscription({ ...valid, auth: "a".repeat(65) })).toThrow(UnprocessableError);
	});
});

describe("normalizePushLocale", () => {
	it("reads every Spanish tag as es and anything else as en", () => {
		expect(normalizePushLocale("es")).toBe("es");
		expect(normalizePushLocale("ES_419")).toBe("es");
		expect(normalizePushLocale(" es-MX ")).toBe("es");
		expect(normalizePushLocale("en-US")).toBe("en");
		expect(normalizePushLocale("pt-BR")).toBe("en");
		expect(normalizePushLocale("")).toBe("en");
		expect(normalizePushLocale(null)).toBe("en");
	});
});
