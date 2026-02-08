export interface PlayerRanking {
    position: number;
    totalPlayers: number;
    points: number;
    rankBadge: string;
}

export function calculateRankBadge(position: number): string {
    if (position === 1) return "Champion";
    if (position <= 10) return "Grandmaster";
    if (position <= 50) return "Master";
    if (position <= 100) return "Diamond";
    return "Challenger";
}
