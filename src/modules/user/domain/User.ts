import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export class User {
	public readonly id: string;
	public readonly email: string;
	public readonly password: string;
	private _username: string;

	private constructor({
		id,
		username,
		email,
		password,
	}: {
		id: string;
		username: string;
		email: string;
		password: string;
	}) {
		this.id = id;
		this._username = username;
		this.email = email;
		this.password = password;
	}

	static create({
		id,
		username,
		email,
		password,
	}: {
		id: string;
		username: string;
		email: string;
		password: string;
	}): User {
		return new User({ id, username, email, password });
	}

	static from(data: { id: string; username: string; password: string; email: string }): User {
		return new User(data);
	}

	get username(): string {
		return this._username;
	}

	toJson(): { id: string; username: string; email: string } {
		return {
			id: this.id,
			username: this.username,
			email: this.email,
		};
	}

	updatePassword(password: string): User {
		if (!password) {
			throw new InvalidArgumentError(`password cannot be empty`);
		}

		return new User({
			id: this.id,
			username: this.username,
			password,
			email: this.email,
		});
	}

	updateUsername(username: string): void {
		if (username.length >= 15 || username.length <= 0) {
			throw new InvalidArgumentError(`the username must contain between 1 and 14 characters`);
		}

		this._username = username;
	}
}
