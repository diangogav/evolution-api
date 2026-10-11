export class UserAchievement {
	public readonly id: number;
	public readonly icon: string;
	public readonly name: string;
	public readonly labels: string[];
	public readonly unlockedAt: Date;
	public readonly description: string;
	public readonly earnedPoints: number;
	public readonly code: string | null;

	private constructor({
		id,
		icon,
		name,
		labels,
		unlockedAt,
		description,
		earnedPoints,
		code = null,
	}: {
		id: number;
		icon: string;
		name: string;
		labels: string[];
		unlockedAt: Date;
		description: string;
		earnedPoints: number;
		code?: string | null;
	}) {
		this.id = id;
		this.icon = icon;
		this.name = name;
		this.labels = labels;
		this.unlockedAt = new Date(unlockedAt);
		this.description = description;
		this.earnedPoints = earnedPoints;
		this.code = code;
	}

	static create({
		id,
		icon,
		name,
		labels,
		unlockedAt,
		description,
		earnedPoints,
		code = null,
	}: {
		id: number;
		icon: string;
		name: string;
		labels: string[];
		unlockedAt: Date | string;
		description: string;
		earnedPoints: number;
		code?: string | null;
	}): UserAchievement {
		return new UserAchievement({
			id,
			icon,
			name,
			labels,
			unlockedAt: new Date(unlockedAt),
			description,
			earnedPoints,
			code,
		});
	}

	static from({
		id,
		icon,
		name,
		labels,
		unlockedAt,
		description,
		earnedPoints,
		code = null,
	}: {
		id: number;
		icon: string;
		name: string;
		labels: string[];
		unlockedAt: Date | string;
		description: string;
		earnedPoints: number;
		code?: string | null;
	}): UserAchievement {
		return new UserAchievement({
			id,
			icon,
			name,
			labels,
			unlockedAt: new Date(unlockedAt),
			description,
			earnedPoints,
			code,
		});
	}

	toJson(): {
		id: number;
		icon: string;
		name: string;
		labels: string[];
		unlockedAt: string;
		description: string;
		earnedPoints: number;
		code: string | null;
	} {
		return {
			id: this.id,
			icon: this.icon,
			name: this.name,
			labels: this.labels,
			unlockedAt: this.unlockedAt.toISOString(),
			description: this.description,
			earnedPoints: this.earnedPoints,
			code: this.code,
		};
	}
}
