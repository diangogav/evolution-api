import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { type AccountFormat, accountFormats } from "../domain/AccountFormats";
import type { AccountFormatsRepository } from "../domain/AccountFormatsRepository";

export type SaveMyFormatsInput = { userId: string; formats: unknown };

export type SaveMyFormatsResult = { formats: AccountFormat[] };

export class SaveMyFormats {
	constructor(private readonly repository: AccountFormatsRepository) {}

	async run(input: SaveMyFormatsInput): Promise<SaveMyFormatsResult> {
		const formats = accountFormats(input.formats);
		if (!(await this.repository.save(input.userId, formats))) {
			throw new NotFoundError("User not found");
		}
		return { formats };
	}
}
