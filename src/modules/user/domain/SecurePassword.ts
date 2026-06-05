import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export class SecurePassword {
	private constructor(public readonly value: string) {}

	static create(value: string): SecurePassword {
		if (value.length < 8) {
			throw new InvalidArgumentError("the password must be at least 8 characters long");
		}
		if (!/[a-zA-Z]/.test(value)) {
			throw new InvalidArgumentError("the password must contain at least one letter");
		}
		if (!/\d/.test(value)) {
			throw new InvalidArgumentError("the password must contain at least one number");
		}

		return new SecurePassword(value);
	}
}
