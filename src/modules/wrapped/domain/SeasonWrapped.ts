import type { Achievement } from "./Achievement";
import type { BanListStats } from "./BanListStats";
import type { ExtraStats } from "./ExtraStats";
import type { Nemesis, Victim } from "./Nemesis";
import type { PlayerRanking } from "./PlayerRanking";
import type { PlayerSeasonStats } from "./PlayerSeasonStats";

export class SeasonWrapped {
    constructor(
        public readonly playerId: string,
        public readonly playerName: string,
        public readonly playerAvatar: string | null,
        public readonly seasonId: number,
        public readonly seasonName: string,
        public readonly seasonDates: { start: Date; end: Date },
        public readonly globalStats: PlayerSeasonStats,
        public readonly banListStats: BanListStats[],
        public readonly nemesis: Nemesis | null,
        public readonly victim: Victim | null,
        public readonly achievements: Achievement[],
        public readonly ranking: PlayerRanking,
        public readonly extraStats: ExtraStats,
    ) { }

    isEmpty(): boolean {
        return this.globalStats.totalMatches === 0;
    }
}
