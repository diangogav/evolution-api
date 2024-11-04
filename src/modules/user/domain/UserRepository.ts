import { User } from "./User";

export interface UserRepository {
	create(user: User): Promise<void>;
	findByEmailOrUsername(email: string, username: string): Promise<User | null>;
}
