export class GamePassword {
	private static readonly LENGTH = 4;
	private static readonly CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	private constructor(public readonly value: string) {}

	static generate(): GamePassword {
		let value = "";
		for (let i = 0; i < GamePassword.LENGTH; i++) {
			const randomIndex = Math.floor(Math.random() * GamePassword.CHARSET.length);
			value += GamePassword.CHARSET.charAt(randomIndex);
		}

		return new GamePassword(value);
	}
}
