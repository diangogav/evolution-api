import { UserAchievement } from "../user-achievement/domain/UserAchievement";

type UserAchievementParams = {
	id: number;
	icon: string;
	name: string;
	labels: string[];
	unlockedAt: string;
	description: string;
	earnedPoints: number;
};

export type RatingSummary = {
	banListName: string;
	rating: number;
	gamesPlayed: number;
	peak: number;
	provisional: boolean;
};

export class UserStats {
	public readonly userId: string;
	public readonly username: string;
	public readonly points: number;
	public readonly wins: number;
	public readonly losses: number;
	public readonly winRate: string;
	public readonly position: number;
	private readonly achievements: UserAchievement[];
	private readonly ratings: RatingSummary[];

	private constructor({
		userId,
		username,
		points,
		wins,
		losses,
		winRate,
		position,
		achievements = [],
		ratings = [],
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		winRate: string;
		position: number;
		achievements?: UserAchievement[];
		ratings?: RatingSummary[];
	}) {
		this.userId = userId;
		this.username = username;
		this.points = points;
		this.wins = wins;
		this.losses = losses;
		this.winRate = winRate;
		this.position = position;
		this.achievements = achievements;
		this.ratings = ratings;
	}

	static create({
		userId,
		username,
		points,
		wins,
		losses,
		position,
		winRate,
		achievements = [],
		ratings = [],
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		position: number;
		winRate: string;
		achievements?: UserAchievementParams[];
		ratings?: RatingSummary[];
	}): UserStats {
		return new UserStats({
			userId,
			username,
			points,
			wins,
			losses,
			winRate,
			position,
			achievements: achievements.map((achievement) => UserAchievement.create(achievement)),
			ratings,
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
		achievements?: UserAchievementParams[];
		ratings?: RatingSummary[];
	}): UserStats {
		return new UserStats({
			...data,
			achievements: data.achievements?.map((achievement) => UserAchievement.from(achievement)),
			ratings: data.ratings,
		});
	}

	toJson(): {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		winRate: string;
		position: number;
		achievements: UserAchievementParams[];
		ratings: RatingSummary[];
	} {
		return {
			userId: this.userId,
			username: this.username,
			points: this.points,
			wins: this.wins,
			losses: this.losses,
			winRate: this.winRate,
			position: this.position,
			achievements: this.achievements.map((achievement) => achievement.toJson()),
			ratings: this.ratings,
		};
	}
}
