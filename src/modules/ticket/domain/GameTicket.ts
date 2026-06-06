export class GameTicket {
	static readonly TTL_SECONDS = 30;

	private constructor(public readonly value: string) {}

	static generate(): GameTicket {
		return new GameTicket(crypto.randomUUID());
	}
}
