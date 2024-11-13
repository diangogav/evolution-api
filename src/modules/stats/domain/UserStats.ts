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
export class UserStats {
	public readonly userId: string;
	public readonly username: string;
	public readonly points: number;
	public readonly wins: number;
	public readonly losses: number;
	public readonly winRate: string;
	public readonly position: number;
	private readonly achievements: UserAchievement[];

	private constructor({
		userId,
		username,
		points,
		wins,
		losses,
		winRate,
		position,
		achievements = [],
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		winRate: string;
		position: number;
		achievements?: UserAchievement[];
	}) {
		this.userId = userId;
		this.username = username;
		this.points = points;
		this.wins = wins;
		this.losses = losses;
		this.winRate = winRate;
		this.position = position;
		this.achievements = achievements;
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
	}: {
		userId: string;
		username: string;
		points: number;
		wins: number;
		losses: number;
		position: number;
		winRate: string;
		achievements?: UserAchievementParams[];
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
	}): UserStats {
		return new UserStats({
			...data,
			achievements: data.achievements?.map((achievement) => UserAchievement.from(achievement)),
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
		};
	}
}
