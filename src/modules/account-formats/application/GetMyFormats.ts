import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { AccountFormat } from "../domain/AccountFormats";
import type { AccountFormatsRepository } from "../domain/AccountFormatsRepository";

export type GetMyFormatsResult = { formats: AccountFormat[] | null };

export class GetMyFormats {
	constructor(private readonly repository: AccountFormatsRepository) {}

	async run(userId: string): Promise<GetMyFormatsResult> {
		const formats = await this.repository.find(userId);
		if (formats === undefined) throw new NotFoundError("User not found");
		return { formats };
	}
}
