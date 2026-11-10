import {
	LightningChatMessage,
	NewLightningChatMessage,
} from "../../../../../src/modules/lightning/domain/LightningChatMessage";
import { LightningChatMessageRepository } from "../../../../../src/modules/lightning/domain/LightningChatMessageRepository";
import {
	LightningChatEvent,
	LightningChatPublisher,
} from "../../../../../src/modules/lightning/domain/LightningChatPublisher";
import { ChatRateLimiter } from "../../../../../src/modules/lightning/domain/ChatRateLimiter";

export const POSTED_AT = new Date("2026-11-10T20:15:00Z");

// The chat table in memory, with the same ordering and visibility rules as the SQL.
export class InMemoryChatMessages implements LightningChatMessageRepository {
	rows: LightningChatMessage[] = [];
	private seq = 0;

	seed(message: NewLightningChatMessage & Partial<LightningChatMessage>): LightningChatMessage {
		const row: LightningChatMessage = {
			id: message.id ?? ++this.seq,
			createdAt: POSTED_AT,
			deletedAt: null,
			deletedBy: null,
			...message,
		};
		this.seq = Math.max(this.seq, row.id);
		this.rows.push(row);
		return { ...row };
	}

	async insert(message: NewLightningChatMessage): Promise<LightningChatMessage> {
		return this.seed(message);
	}

	async pageBefore(tournamentId: string, beforeId: number | null, limit: number) {
		return this.of(tournamentId)
			.filter((row) => beforeId === null || row.id < beforeId)
			.slice(-limit);
	}

	async listAfter(tournamentId: string, afterId: number, cap: number) {
		return this.of(tournamentId)
			.filter((row) => row.id > afterId && !row.deletedAt)
			.slice(0, cap);
	}

	async findById(id: number) {
		const row = this.rows.find((candidate) => candidate.id === id);
		return row ? { ...row } : null;
	}

	async softDelete(id: number, adminUserId: string) {
		const row = this.rows.find((candidate) => candidate.id === id);
		if (!row || row.deletedAt) return false;
		row.deletedAt = POSTED_AT;
		row.deletedBy = adminUserId;
		return true;
	}

	private of(tournamentId: string) {
		return this.rows
			.filter((row) => row.tournamentId === tournamentId)
			.sort((a, b) => a.id - b.id)
			.map((row) => ({ ...row }));
	}
}

export class FakeRateLimiter implements ChatRateLimiter {
	allow = true;
	calls: string[] = [];

	async consume(tournamentId: string, userId: string) {
		this.calls.push(`${tournamentId}:${userId}`);
		return this.allow;
	}
}

export class FakePublisher implements LightningChatPublisher {
	events: LightningChatEvent[] = [];
	failure: Error | null = null;

	async publish(event: LightningChatEvent) {
		if (this.failure) throw this.failure;
		this.events.push(event);
	}
}
