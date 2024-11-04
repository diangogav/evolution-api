export class Leaderboard {
	public readonly userId: string;
	public readonly username: string;
	public readonly points: number;
	public readonly wins: number;
	public readonly losses: number;
	public readonly winRate: string;
	public readonly position: number;

	private constructor({
		userId,
		username,
		points,
		wins,
		losses,
		winRate,
		position,
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		winRate: string;
		position: number;
	}) {
		this.userId = userId;
		this.username = username;
		this.points = points;
		this.wins = wins;
		this.losses = losses;
		this.winRate = winRate;
		this.position = position;
	}

	static create({
		userId,
		username,
		points,
		wins,
		losses,
		position,
		winRate,
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		position: number;
		winRate: string;
	}): Leaderboard {
		return new Leaderboard({
			userId,
			username,
			points,
			wins,
			losses,
			winRate,
			position,
		});
	}

	static from(data: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		position: number;
		winRate: string;
	}): Leaderboard {
		return Leaderboard.create(data);
	}

	toJson(): {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		winRate: string;
		position: number;
	} {
		return {
			userId: this.userId,
			username: this.username,
			points: this.points,
			wins: this.wins,
			losses: this.losses,
			winRate: this.winRate,
			position: this.position,
		};
	}
}
