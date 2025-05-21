export class PeriodUserStats {
    public readonly userId: string;
    public readonly username: string;
    public readonly points: number;
    public readonly wins: number;
    public readonly losses: number;
    public readonly from: string;
    public readonly to: string;

    private constructor({
        userId,
        username,
        points,
        wins,
        losses,
        from,
        to,
    }: {
        userId: string;
        username: string;
        points: number;
        wins: number;
        losses: number;
        from: string;
        to: string;
    }) {
        this.userId = userId;
        this.username = username;
        this.points = points;
        this.wins = wins;
        this.losses = losses;
        this.from = from;
        this.to = to;
    }

    static from(data: {
        userId: string;
        username: string;
        points: number;
        wins: number;
        losses: number;
        from: string;
        to: string;
    }): PeriodUserStats {
        return new PeriodUserStats(data);
    }
}