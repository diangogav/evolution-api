export interface TournamentRankingProps {
    userId: string;
    points: number;
    tournamentsWon: number;
    tournamentsPlayed: number;
    lastUpdated: Date;
}

export class TournamentRanking {
    private constructor(private props: TournamentRankingProps) { }

    static create(props: TournamentRankingProps): TournamentRanking {
        return new TournamentRanking(props);
    }

    static createNew(userId: string): TournamentRanking {
        return new TournamentRanking({
            userId,
            points: 0,
            tournamentsWon: 0,
            tournamentsPlayed: 0,
            lastUpdated: new Date(),
        });
    }

    addWin(points: number) {
        this.props.points += points;
        this.props.tournamentsWon += 1;
        this.props.tournamentsPlayed += 1;
        this.props.lastUpdated = new Date();
    }

    addParticipation(points: number) {
        this.props.points += points;
        this.props.tournamentsPlayed += 1;
        this.props.lastUpdated = new Date();
    }

    get userId() { return this.props.userId; }
    get points() { return this.props.points; }
    get tournamentsWon() { return this.props.tournamentsWon; }
    get tournamentsPlayed() { return this.props.tournamentsPlayed; }
    get lastUpdated() { return this.props.lastUpdated; }

    toPrimitives() {
        return { ...this.props };
    }
}
