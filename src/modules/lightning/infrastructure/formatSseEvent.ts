export type SseEvent = {
	/** Event name; omitted means the default `message` type. */
	event?: string;
	/** Moves the reader's Last-Event-ID; omitted leaves it unchanged. */
	id?: string | number;
	data: string;
};

const LINE_BREAK = /\r\n|\r|\n/;

// A line break inside a field would end it early and let the rest be read as another
// field, so `event` and `id` lose theirs and every data line gets its own `data:` prefix.
function singleLine(value: string): string {
	return value.replace(/[\r\n]/g, "");
}

/** Frames one Server-Sent Event, terminated by the blank line that dispatches it. */
export function formatSseEvent({ event, id, data }: SseEvent): string {
	let frame = "";
	if (event !== undefined) frame += `event: ${singleLine(event)}\n`;
	if (id !== undefined) frame += `id: ${singleLine(String(id))}\n`;
	for (const line of data.split(LINE_BREAK)) frame += `data: ${line}\n`;
	return `${frame}\n`;
}

/** An SSE comment: readers ignore it, proxies see traffic on an idle connection. */
export function formatSseComment(text: string): string {
	return `: ${singleLine(text)}\n\n`;
}
