import { describe, expect, it } from "bun:test";

import { describeDevice } from "../../../../../src/modules/auth/domain/describeDevice";

describe("describeDevice", () => {
	it.each([
		[
			"Chrome on Android",
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
			{ browser: "Chrome", os: "Android" },
		],
		[
			"Safari on iOS",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
			{ browser: "Safari", os: "iOS" },
		],
		[
			"Firefox on Windows",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
			{ browser: "Firefox", os: "Windows" },
		],
		[
			"Edge on Windows, which also announces Chrome",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
			{ browser: "Edge", os: "Windows" },
		],
		[
			"Chrome on macOS",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			{ browser: "Chrome", os: "macOS" },
		],
		[
			"the Android app WebView",
			"Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36",
			{ browser: "Evolution app", os: "Android" },
		],
		[
			"the iOS app WebView",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
			{ browser: "Evolution app", os: "iOS" },
		],
	])("names %s", (_label, userAgent, expected) => {
		expect(describeDevice(userAgent)).toEqual(expected);
	});

	it("gives nulls for an agent it does not recognise, such as another game client", () => {
		expect(
			describeDevice("UnityPlayer/2022.3.20f1 (UnityWebRequest/1.0, libcurl/8.4.0-DEV)"),
		).toEqual({
			browser: null,
			os: null,
		});
	});

	it("gives nulls when there is no agent", () => {
		expect(describeDevice(null)).toEqual({ browser: null, os: null });
		expect(describeDevice("")).toEqual({ browser: null, os: null });
	});
});
