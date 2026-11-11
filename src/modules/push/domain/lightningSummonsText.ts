import { PushLocale } from "./PushSubscription";

export type NotificationText = { title: string; body: string };

// Rendered by the API: the service worker that shows it has no access to the app's i18n.
export function lightningSummonsText(
	locale: PushLocale,
	input: { tournamentName: string; lobbyTimeoutSeconds: number },
): NotificationText {
	const name = input.tournamentName.trim();
	const seconds = input.lobbyTimeoutSeconds;
	if (locale === "es") {
		const call = `Entra ahora: la sala espera ${seconds} s`;
		return { title: "Tu duelo del torneo está listo", body: name ? `${name}. ${call}` : call };
	}
	const call = `Join now: the room waits ${seconds} s`;
	return { title: "Your tournament duel is ready", body: name ? `${name}. ${call}` : call };
}
