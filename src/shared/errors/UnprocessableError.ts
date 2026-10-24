// The request is well-formed but the resource is not in a state that allows it
// (for example claiming a mission that is not completed yet). Maps to 422.
export class UnprocessableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnprocessableError";
	}
}
