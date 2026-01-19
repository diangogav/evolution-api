import { User } from "./User";

export interface UserRepository {
	create(user: User): Promise<void>;
	findByEmailOrUsername(email: string, username: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	findById(id: string): Promise<User | null>;
	update(user: User): Promise<void>;
	updateParticipantId(userId: string, participantId: string): Promise<void>;
	findByParticipantId(participantId: string): Promise<User | null>;
}
