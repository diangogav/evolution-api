import bcrypt from "bcrypt";

export class Hash {
	async hash(password: string): Promise<string> {
		return bcrypt.hash(password, 10);
	}
}
