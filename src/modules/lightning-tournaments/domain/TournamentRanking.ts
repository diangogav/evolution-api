export interface TournamentRankingProps {
    userId: string;
    points: number;
    tournamentsWon: number;
    tournamentsPlayed: number;
    lastUpdated: Date;
}

export class TournamentRanking {
    private constructor(
        private readonly userId: string,
        private readonly _points: number,
        private readonly _tournamentsWon: number,
        private readonly _tournamentsPlayed: number
    ) { }

    static createNew(props: {
        userId: string;
        points: number;
        tournamentsWon: number;
        tournamentsPlayed: number;
    }): TournamentRanking {
        return new TournamentRanking(
            props.userId,
            props.points,
            props.tournamentsWon,
            props.tournamentsPlayed
        );
    }

    static fromPrimitives(props: {
        userId: string;
        points: number;
        tournamentsWon: number;
        tournamentsPlayed: number;
    }): TournamentRanking {
        return new TournamentRanking(
            props.userId,
            props.points,
            props.tournamentsWon,
            props.tournamentsPlayed
        );
    }

    addPoints(points: number): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points + points,
            this._tournamentsWon,
            this._tournamentsPlayed
        );
    }

    incrementTournamentsPlayed(): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points,
            this._tournamentsWon,
            this._tournamentsPlayed + 1
        );
    }

    incrementTournamentsWon(): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points,
            this._tournamentsWon + 1,
            this._tournamentsPlayed
        );
    }

    get points(): number {
        return this._points;
    }

    get tournamentsWon(): number {
        return this._tournamentsWon;
    }

    get tournamentsPlayed(): number {
        return this._tournamentsPlayed;
    }

    getUserId(): string {
        return this.userId;
    }

    toPrimitives() {
        return {
            userId: this.userId,
            points: this._points,
            tournamentsWon: this._tournamentsWon,
            tournamentsPlayed: this._tournamentsPlayed,
        };
    }
}
