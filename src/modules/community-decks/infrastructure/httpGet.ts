export const COMMUNITY_DECKS_USER_AGENT = "EvolutionYGO/1.0 (+https://evoduel.com)";
const TIMEOUT_MS = 30_000;

// Every outbound request of the sync identifies us and gives up instead of hanging a tick.
async function get(url: string): Promise<Response> {
	const response = await fetch(url, {
		headers: { "User-Agent": COMMUNITY_DECKS_USER_AGENT },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
	return response;
}

export async function getText(url: string): Promise<string> {
	return (await get(url)).text();
}

export async function getJson(url: string): Promise<unknown> {
	return (await get(url)).json();
}
