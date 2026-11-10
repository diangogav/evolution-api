import { TooManyRequestsError } from "../../../shared/errors/TooManyRequestsError";
import { Logger } from "../../../shared/logger/domain/Logger";
import { GetLightningChatReplay } from "../application/GetLightningChatReplay";
import { LightningChatEvent } from "../domain/LightningChatPublisher";
import { formatSseComment, formatSseEvent } from "./formatSseEvent";
import { LightningChatHub } from "./LightningChatHub";

/** Idle proxies close quiet connections; a comment this often keeps the stream open. */
export const LIGHTNING_CHAT_HEARTBEAT_MS = 25_000;
/**
 * How long a new stream waits for its channel subscription before replaying anyway. With
 * Redis unreachable the subscription never settles; the stream still opens and serves the
 * replay, and live events resume on the reader's next reconnection.
 */
export const LIGHTNING_CHAT_SETTLE_TIMEOUT_MS = 5_000;

export const LIGHTNING_CHAT_STREAM_HEADERS = {
	"Content-Type": "text/event-stream; charset=utf-8",
	"Cache-Control": "no-cache",
	Connection: "keep-alive",
	// Proxies that buffer responses would hold the events back until the stream ends.
	"X-Accel-Buffering": "no",
} as const;

/** Calls `tick` every `ms` until the returned function stops it. */
export type RepeatTimer = (tick: () => void, ms: number) => () => void;

const repeatWithInterval: RepeatTimer = (tick, ms) => {
	const handle = setInterval(tick, ms);
	return () => clearInterval(handle);
};

export type LightningChatStreamOptions = {
	heartbeatMs?: number;
	settleTimeoutMs?: number;
	repeat?: RepeatTimer;
};

export type OpenLightningChatStreamInput = {
	tournamentId: string;
	userId: string;
	/** The raw `Last-Event-ID` header; absent or not a message id means no replay. */
	lastEventId: string | null;
	/** Aborts when the client goes away. */
	signal: AbortSignal;
};

/** Parses a `Last-Event-ID` header into a message id, or null when it holds none. */
export function parseLastEventId(raw: string | null): number | null {
	if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return null;
	return Number(raw.trim());
}

/**
 * Opens one tournament's chat as a Server-Sent Events response. The listener is registered
 * before the replay is read and holds live events back until the replay is written, so no
 * message falls between the two; a held-back message the replay already carried is
 * dropped by id.
 */
export class LightningChatStreams {
	private readonly heartbeatMs: number;
	private readonly settleTimeoutMs: number;
	private readonly repeat: RepeatTimer;
	private readonly encoder = new TextEncoder();

	constructor(
		private readonly hub: Pick<LightningChatHub, "tryRegister" | "whenSettled">,
		private readonly replay: Pick<GetLightningChatReplay, "run">,
		private readonly logger: Pick<Logger, "error">,
		options: LightningChatStreamOptions = {},
	) {
		this.heartbeatMs = options.heartbeatMs ?? LIGHTNING_CHAT_HEARTBEAT_MS;
		this.settleTimeoutMs = options.settleTimeoutMs ?? LIGHTNING_CHAT_SETTLE_TIMEOUT_MS;
		this.repeat = options.repeat ?? repeatWithInterval;
	}

	async open(input: OpenLightningChatStreamInput): Promise<Response> {
		const { tournamentId, userId, signal } = input;
		await this.replay.run({ tournamentId, afterId: null });

		let held: LightningChatEvent[] | null = [];
		let deliver!: (event: LightningChatEvent) => void;
		const unregister = this.hub.tryRegister(tournamentId, userId, (event) => {
			if (held) held.push(event);
			else deliver(event);
		});
		if (!unregister) {
			throw new TooManyRequestsError("Too many open chat streams, close one first");
		}

		const afterId = parseLastEventId(input.lastEventId);
		let replayed: Awaited<ReturnType<GetLightningChatReplay["run"]>>;
		try {
			await this.settled(tournamentId);
			replayed =
				afterId === null
					? { messages: [], truncated: false }
					: await this.replay.run({ tournamentId, afterId });
		} catch (error) {
			unregister();
			throw error;
		}

		let controller!: ReadableStreamDefaultController<Uint8Array>;
		let closed = false;
		let stopHeartbeat: (() => void) | null = null;
		const close = () => {
			if (closed) return;
			closed = true;
			unregister();
			stopHeartbeat?.();
			signal.removeEventListener("abort", close);
			try {
				controller.close();
			} catch {
				// Already closed or cancelled by the reader.
			}
		};
		const write = (frame: string) => {
			if (closed) return;
			try {
				controller.enqueue(this.encoder.encode(frame));
			} catch (error) {
				this.logger.error(`Lightning chat stream write failed: ${errorMessage(error)}`);
				close();
			}
		};

		let cursor = afterId ?? 0;
		deliver = (event) => {
			if (event.type === "deleted") {
				write(formatSseEvent({ event: "deleted", data: JSON.stringify({ id: event.id }) }));
				return;
			}
			if (event.message.id <= cursor) return;
			cursor = event.message.id;
			write(
				formatSseEvent({
					event: "message",
					id: event.message.id,
					data: JSON.stringify(event.message),
				}),
			);
		};

		const body = new ReadableStream<Uint8Array>({
			start: (streamController) => {
				controller = streamController;
			},
			cancel: close,
		});
		if (signal.aborted) {
			close();
			return new Response(body, { headers: LIGHTNING_CHAT_STREAM_HEADERS });
		}
		signal.addEventListener("abort", close);

		for (const message of replayed.messages) deliver({ type: "message", message });
		if (replayed.truncated) {
			write(formatSseEvent({ event: "reset", data: "{}" }));
		}
		const pending = held;
		held = null;
		for (const event of pending) deliver(event);

		if (!closed) {
			stopHeartbeat = this.repeat(() => write(formatSseComment("ping")), this.heartbeatMs);
		}
		return new Response(body, { headers: LIGHTNING_CHAT_STREAM_HEADERS });
	}

	private settled(tournamentId: string): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, this.settleTimeoutMs);
		});
		return Promise.race([this.hub.whenSettled(tournamentId), timeout]).finally(() =>
			clearTimeout(timer),
		);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
