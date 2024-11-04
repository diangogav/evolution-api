export class User {
	public readonly id: string;
	public readonly username: string;
	public readonly email: string;
	public readonly password: string;

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
		this.username = username;
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

	toJson(): { id: string; username: string; email: string } {
		return {
			id: this.id,
			username: this.username,
			email: this.email,
		};
	}
}
