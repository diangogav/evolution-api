// The caller sent too many requests in a short window (chat flood). Maps to 429.
export class TooManyRequestsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TooManyRequestsError";
	}
}
