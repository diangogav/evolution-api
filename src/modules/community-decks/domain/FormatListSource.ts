import type { FormatListId } from "./CommunityDeckCategory";
import type { FormatList } from "./FormatList";

export interface FormatListSource {
	fetch(id: FormatListId): Promise<FormatList>;
}
