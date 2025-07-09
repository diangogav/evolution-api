import { UserBan } from "./UserBan";

export interface UserBanRepository {
    banUser(ban: UserBan): Promise<void>;
    findActiveBanByUserId(userId: string): Promise<UserBan | null>;
    unbanUser(userId: string): Promise<void>;
    getBansByUserId(userId: string): Promise<UserBan[]>;
    finishActiveBan(userId: string, finishedAt: Date): Promise<void>;
} 