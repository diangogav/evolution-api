export type DeviceDescription = {
	browser: string | null;
	os: string | null;
};

/** The name shown for the Android and iOS builds, which run the web client in a WebView. */
export const APP_NAME = "Evolution app";

// Order matters: Edge, Opera and Samsung Internet also announce Chrome, and every
// Chromium browser also announces Safari.
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
	[/Edg(A|iOS)?\//, "Edge"],
	[/OPR\//, "Opera"],
	[/SamsungBrowser\//, "Samsung Internet"],
	[/Firefox\/|FxiOS\//, "Firefox"],
	[/Chrome\/|CriOS\//, "Chrome"],
	[/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
	[/Android/, "Android"],
	[/iPhone|iPad|iPod/, "iOS"],
	[/CrOS/, "ChromeOS"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Linux/, "Linux"],
];

/**
 * Names the browser and OS a User-Agent header announces, for the list of signed-in
 * devices. Only a hint: the header is set by the client and can say anything. Agents it
 * does not recognise, such as other game clients, give nulls.
 */
export function describeDevice(userAgent: string | null): DeviceDescription {
	if (!userAgent) return { browser: null, os: null };

	const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
	return { browser: browserOf(userAgent, os), os };
}

function browserOf(userAgent: string, os: string | null): string | null {
	// An Android WebView marks itself with "wv"; an iOS WebView leaves out Safari.
	if (os === "Android" && /; wv\)/.test(userAgent)) return APP_NAME;
	if (os === "iOS" && /AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent)) {
		return APP_NAME;
	}
	if (!/Mozilla\//.test(userAgent)) return null;

	return BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}
