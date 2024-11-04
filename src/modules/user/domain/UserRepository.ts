import { User } from "./User";

export interface UserRepository {
	create(user: User): Promise<void>;
	findByEmailOrUsername(email: string, username: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	findById(email: string): Promise<User | null>;
	update(user: User): Promise<void>;
}
