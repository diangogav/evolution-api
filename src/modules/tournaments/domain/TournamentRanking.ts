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
        private readonly _tournamentsPlayed: number,
        private readonly _season: string
    ) { }

    static createNew(props: {
        userId: string;
        points: number;
        tournamentsWon: number;
        tournamentsPlayed: number;
        season: string;
    }): TournamentRanking {
        return new TournamentRanking(
            props.userId,
            props.points,
            props.tournamentsWon,
            props.tournamentsPlayed,
            props.season,
        );
    }

    static fromPrimitives(props: {
        userId: string;
        points: number;
        tournamentsWon: number;
        tournamentsPlayed: number;
        season: string;
    }): TournamentRanking {
        return new TournamentRanking(
            props.userId,
            props.points,
            props.tournamentsWon,
            props.tournamentsPlayed,
            props.season
        );
    }

    addPoints(points: number): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points + points,
            this._tournamentsWon,
            this._tournamentsPlayed,
            this._season
        );
    }

    incrementTournamentsPlayed(): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points,
            this._tournamentsWon,
            this._tournamentsPlayed + 1,
            this._season
        );
    }

    incrementTournamentsWon(): TournamentRanking {
        return new TournamentRanking(
            this.userId,
            this._points,
            this._tournamentsWon + 1,
            this._tournamentsPlayed,
            this._season
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

    get season(): string {
        return this._season;
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
