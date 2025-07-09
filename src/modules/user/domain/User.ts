import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export class User {
	public readonly id: string;
	public readonly email: string;
	public readonly password: string;
	private _username: string;
	public readonly role: UserProfileRole;

	private constructor({
		id,
		username,
		email,
		password,
		role,
	}: {
		id: string;
		username: string;
		email: string;
		password: string;
		role: UserProfileRole;
	}) {
		this.id = id;
		this._username = username;
		this.email = email;
		this.password = password;
		this.role = role;
	}

	static create({
		id,
		username,
		email,
		password,
		role,
	}: {
		id: string;
		username: string;
		email: string;
		password: string;
		role: UserProfileRole;
	}): User {
		if (!username.trim()) {
			throw new InvalidArgumentError(`username cannot be empty`);
		}
		if (username.length > 14) {
			throw new InvalidArgumentError(`the username must contain between 1 and 14 characters`);
		}
		if (!email.trim()) {
			throw new InvalidArgumentError(`email cannot be empty`);
		}
		if (!password.trim()) {
			throw new InvalidArgumentError(`password cannot be empty`);
		}
		return new User({ id, username, email, password, role });
	}

	static from(data: { id: string; username: string; password: string; email: string; role: UserProfileRole }): User {
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
			role: this.role,
		});
	}

	updateUsername(username: string): void {
		if (!username.trim()) {
			throw new InvalidArgumentError(`username cannot be empty`);
		}
		if (username.length > 14 || username.length <= 0) {
			throw new InvalidArgumentError(`the username must contain between 1 and 14 characters`);
		}
		this._username = username;
	}
}
