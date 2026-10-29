import type {
	CommunityDeckFormatCount,
	CommunityDeckRepository,
} from "../domain/CommunityDeckRepository";

export class ListCommunityDeckFormats {
	constructor(private readonly repository: Pick<CommunityDeckRepository, "formats">) {}

	run(): Promise<CommunityDeckFormatCount[]> {
		return this.repository.formats();
	}
}
