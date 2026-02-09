export class PlayerSeasonStats {
    constructor(
        public readonly totalMatches: number,
        public readonly wins: number,
        public readonly losses: number,
        public readonly draws: number,
        public readonly winrate: number,
        public readonly bestWinStreak: number,
        public readonly worstLoseStreak: number,
        public readonly avgMatchesPerDay: number,
        public readonly avgMatchesPerWeek: number,
        public readonly firstMatchDate: Date | null,
        public readonly lastMatchDate: Date | null,
        public readonly activeDays: number,
    ) { }

    static createEmpty(): PlayerSeasonStats {
        return new PlayerSeasonStats(0, 0, 0, 0, 0, 0, 0, 0, 0, null, null, 0);
    }
}
