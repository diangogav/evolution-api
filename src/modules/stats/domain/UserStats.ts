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

export type RankType = "banlist" | "group" | "global";

export type RatingSummary = {
	banListName: string;
	rating: number;
	gamesPlayed: number;
	peak: number;
	provisional: boolean;
	rankType: RankType;
	/** Ban list ladders nested under this entry. Only present on "group" entries. */
	members?: string[];
};

type UserStatsParams = {
	userId: string;
	username: string;
	points: number;
	wins: number;
	losses: number;
	position: number;
	winRate: string;
	achievements?: UserAchievementParams[];
	ratings?: RatingSummary[];
	rating?: number | null;
	peak?: number | null;
	provisional?: boolean | null;
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
	private readonly rating?: number | null;
	private readonly peak?: number | null;
	private readonly provisional?: boolean | null;

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
		rating,
		peak,
		provisional,
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
		rating?: number | null;
		peak?: number | null;
		provisional?: boolean | null;
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
		this.rating = rating;
		this.peak = peak;
		this.provisional = provisional;
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
		rating,
		peak,
		provisional,
	}: UserStatsParams): UserStats {
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
			rating,
			peak,
			provisional,
		});
	}

	static from(data: UserStatsParams): UserStats {
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
		rating?: number | null;
		peak?: number | null;
		provisional?: boolean | null;
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
			rating: this.rating,
			peak: this.peak,
			provisional: this.provisional,
		};
	}
}
