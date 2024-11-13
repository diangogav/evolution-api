export class Match {
	public readonly userId: string;
	public readonly bestOf: number;
	public readonly banListName: string;
	public readonly playerNames: string[];
	public readonly opponentNames: string[];
	public readonly playerScore: number;
	public readonly opponentScore: number;
	public readonly points: number;
	public readonly winner: boolean;
	public readonly date: Date;
	public readonly season: number;

	private constructor({
		userId,
		bestOf,
		banListName,
		playerNames,
		opponentNames,
		playerScore,
		opponentScore,
		points,
		winner,
		date,
		season,
	}: {
		userId: string;
		bestOf: number;
		banListName: string;
		playerNames: string[];
		opponentNames: string[];
		playerScore: number;
		opponentScore: number;
		points: number;
		winner: boolean;
		date: Date;
		season: number;
	}) {
		this.userId = userId;
		this.bestOf = bestOf;
		this.banListName = banListName;
		this.playerNames = playerNames;
		this.opponentNames = opponentNames;
		this.playerScore = playerScore;
		this.opponentScore = opponentScore;
		this.points = points;
		this.winner = winner;
		this.date = date;
		this.season = season;
	}

	static create({
		userId,
		bestOf,
		banListName,
		playerNames,
		opponentNames,
		playerScore,
		opponentScore,
		points,
		winner,
		date,
		season,
	}: {
		userId: string;
		bestOf: number;
		banListName: string;
		playerNames: string[];
		opponentNames: string[];
		playerScore: number;
		opponentScore: number;
		points: number;
		winner: boolean;
		date: Date;
		season: number;
	}): Match {
		return new Match({
			userId,
			bestOf,
			banListName,
			playerNames,
			opponentNames,
			playerScore,
			opponentScore,
			points,
			winner,
			date,
			season,
		});
	}

	static from(data: {
		userId: string;
		bestOf: number;
		banListName: string;
		playerNames: string[];
		opponentNames: string[];
		playerScore: number;
		opponentScore: number;
		points: number;
		winner: boolean;
		date: Date;
		season: number;
	}): Match {
		return Match.create(data);
	}

	toJson(): {
		userId: string;
		bestOf: number;
		banListName: string;
		playerNames: string[];
		opponentNames: string[];
		playerScore: number;
		opponentScore: number;
		points: number;
		winner: boolean;
		date: Date;
		season: number;
	} {
		return {
			userId: this.userId,
			bestOf: this.bestOf,
			banListName: this.banListName,
			playerNames: this.playerNames,
			opponentNames: this.opponentNames,
			playerScore: this.playerScore,
			opponentScore: this.opponentScore,
			points: this.points,
			winner: this.winner,
			date: this.date,
			season: this.season,
		};
	}
}
