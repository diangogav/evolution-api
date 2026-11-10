import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import {
	InvalidLightningTournamentError,
	lightningTournament,
	NewLightningTournament,
} from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningTournamentView, toTournamentView } from "./LightningViews";

export type CreateLightningTournamentInput = Omit<NewLightningTournament, "id">;

export class CreateLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly newId: () => string = () => crypto.randomUUID(),
	) {}

	async run(input: CreateLightningTournamentInput): Promise<LightningTournamentView> {
		let tournament: ReturnType<typeof lightningTournament>;
		try {
			tournament = lightningTournament({ ...input, id: this.newId() });
		} catch (error) {
			if (error instanceof InvalidLightningTournamentError) {
				throw new UnprocessableError(error.message);
			}
			throw error;
		}
		await this.tournaments.insert(tournament);
		return toTournamentView(tournament);
	}
}
