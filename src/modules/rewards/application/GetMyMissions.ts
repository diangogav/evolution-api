import { Locale, localize } from "../domain/LocalizedText";
import { Mission, MissionPeriod, MissionReward } from "../domain/Mission";
import { MissionCatalogRepository } from "../domain/MissionCatalogRepository";
import { MissionClaimRepository } from "../domain/MissionClaimRepository";
import { RewardsProjectionRepository } from "../domain/RewardsProjectionRepository";
import { currentMissions } from "../domain/currentMissions";

export type MissionView = {
	code: string;
	name: string;
	description: string;
	target: number;
	value: number;
	reward: MissionReward;
	completed: boolean;
	claimed: boolean;
};

export type GetMyMissionsInput = {
	userId: string;
	period: MissionPeriod;
	locale: Locale;
	now: Date;
};

export class GetMyMissions {
	constructor(
		private readonly catalog: MissionCatalogRepository,
		private readonly projection: RewardsProjectionRepository,
		private readonly claims: MissionClaimRepository,
	) {}

	async run(input: GetMyMissionsInput): Promise<MissionView[]> {
		const { periodKey, missions } = currentMissions(
			await this.catalog.findActive(),
			input.period,
			input.now,
		);
		const missionIds = missions.map((mission) => mission.id);
		const [progress, claimed] = await Promise.all([
			this.projection.loadProgress(
				input.userId,
				missions.map((mission) => ({ missionId: mission.id, periodKey })),
			),
			this.claims.findClaimedMissionIds(input.userId, missionIds, periodKey),
		]);

		return missions.map((mission) =>
			toView(
				mission,
				input.locale,
				progress.find((row) => row.missionId === mission.id),
				claimed.includes(mission.id),
			),
		);
	}
}

function toView(
	mission: Mission,
	locale: Locale,
	progress: { value: number; completed: boolean } | undefined,
	claimed: boolean,
): MissionView {
	return {
		code: mission.code,
		name: localize(mission.name, locale),
		description: localize(mission.description, locale),
		target: mission.rule.target,
		value: progress?.value ?? 0,
		reward: mission.reward,
		completed: progress?.completed ?? false,
		claimed,
	};
}
