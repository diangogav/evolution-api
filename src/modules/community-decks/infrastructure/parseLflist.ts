import type { FormatList } from "../domain/FormatList";

// lflist.conf: `!<name>` opens a section, `$whitelist` marks it as one, entries are
// `<passcode> <limit> [points] --comment`, and `#`/`--` lines are comments. Genesys' third
// column is its point cost; point budgets are not checked here.
const ENTRY = /^(\d+)\s+(\d+)/;

export function parseLflist(text: string, matches: (header: string) => boolean): FormatList | null {
	let current: { label: string; whitelist: boolean; limits: Map<number, number> } | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith("!")) {
			if (current) return current;
			const label = line.slice(1).trim();
			if (matches(label)) current = { label, whitelist: false, limits: new Map() };
			continue;
		}
		if (!current) continue;
		if (line === "$whitelist") {
			current.whitelist = true;
			continue;
		}
		const entry = ENTRY.exec(line);
		if (entry) current.limits.set(Number(entry[1]), Number(entry[2]));
	}
	return current;
}

// The base list keeps its sections newest first, OCG and TCG interleaved; the first header
// naming TCG is the current TCG list.
export const isNewestTcgSection = (header: string): boolean => /\bTCG\b/.test(header);
