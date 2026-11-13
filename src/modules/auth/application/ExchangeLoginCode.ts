import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { JWT } from "../../../shared/JWT";
import { UserRepository } from "../../user";
import { LoginCodeStore } from "../domain/LoginCodeStore";

export type ExchangeLoginCodeResult = {
	id: string;
	token: string;
	username: string;
	mustUpgrade: boolean;
};

/** Trades the single-use code from a Discord sign-in for a session. */
export class ExchangeLoginCode {
	constructor(
		private readonly loginCodes: Pick<LoginCodeStore, "consume">,
		private readonly users: Pick<UserRepository, "findById">,
		private readonly jwt: JWT,
	) {}

	async run({ code }: { code: string }): Promise<ExchangeLoginCodeResult> {
		const userId = await this.loginCodes.consume(code);
		const user = userId ? await this.users.findById(userId) : null;
		if (!user) {
			throw new AuthenticationError("Invalid or expired login code");
		}

		// The user proved who they are through Discord, so there is nothing to upgrade.
		const token = this.jwt.generate({ id: user.id, role: user.role });
		return { id: user.id, token, username: user.username, mustUpgrade: false };
	}
}
