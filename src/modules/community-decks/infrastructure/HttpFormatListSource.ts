import type { FormatListId } from "../domain/CommunityDeckCategory";
import type { FormatList } from "../domain/FormatList";
import type { FormatListSource } from "../domain/FormatListSource";
import { isNewestTcgSection, parseLflist } from "./parseLflist";

const EVOLUTION_ASSETS = "https://raw.githubusercontent.com/diangogav/evolution-assets/main";

// The same lists the client validates decks with: the moecube base list for TCG and the
// evolution-assets lists for Edison (whitelist with our errata ids) and Genesys.
export const FORMAT_LISTS: Record<
	FormatListId,
	{ url: string; section: (header: string) => boolean }
> = {
	tcg: {
		url: "https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf",
		section: isNewestTcgSection,
	},
	genesys: {
		url: `${EVOLUTION_ASSETS}/lflist/genesys.lflist.conf`,
		section: (header) => header === "Genesys",
	},
	edison: {
		url: `${EVOLUTION_ASSETS}/lflist/edison.lflist.conf`,
		section: (header) => header === "2010.3 Edison",
	},
};

export class HttpFormatListSource implements FormatListSource {
	constructor(private readonly getText: (url: string) => Promise<string>) {}

	async fetch(id: FormatListId): Promise<FormatList> {
		const { url, section } = FORMAT_LISTS[id];
		const list = parseLflist(await this.getText(url), section);
		if (!list) throw new Error(`No ${id} section in ${url}`);
		return list;
	}
}
