export class UserBan {
    public readonly id: string;
    public readonly userId: string;
    public readonly reason: string;
    public readonly bannedAt: Date;
    public readonly expiresAt?: Date;
    public readonly bannedBy: string;
    public readonly createdAt: Date;
    public readonly updatedAt: Date;

    private constructor(params: {
        id: string;
        userId: string;
        reason: string;
        bannedAt: Date;
        expiresAt?: Date;
        bannedBy: string;
        createdAt: Date;
        updatedAt: Date;
    }) {
        this.id = params.id;
        this.userId = params.userId;
        this.reason = params.reason;
        this.bannedAt = params.bannedAt;
        this.expiresAt = params.expiresAt;
        this.bannedBy = params.bannedBy;
        this.createdAt = params.createdAt;
        this.updatedAt = params.updatedAt;
    }

    static create(params: {
        id: string;
        userId: string;
        reason: string;
        bannedAt: Date;
        expiresAt?: Date;
        bannedBy: string;
        createdAt: Date;
        updatedAt: Date;
    }): UserBan {
        return new UserBan(params);
    }

    static from(data: {
        id: string;
        userId: string;
        reason: string;
        bannedAt: Date;
        expiresAt?: Date;
        bannedBy: string;
        createdAt: Date;
        updatedAt: Date;
    }): UserBan {
        return new UserBan({
            id: data.id,
            userId: data.userId,
            reason: data.reason,
            bannedAt: data.bannedAt,
            expiresAt: data.expiresAt,
            bannedBy: data.bannedBy,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        });
    }
} 