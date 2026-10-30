export enum CosmeticType {
	SLEEVE = "SLEEVE",
	PLAYMAT = "PLAYMAT",
	CARD_BACK = "CARD_BACK",
	AVATAR = "AVATAR",
	SUMMON_EFFECT = "SUMMON_EFFECT",
	MUSIC = "MUSIC",
	TITLE = "TITLE",
	/** The frame a player's zones wear, worn beside the playmat. */
	LANE = "LANE",
	/** Drifting motes and a light sweep the board draws over the stage. */
	AMBIENCE = "AMBIENCE",
	/** A set of Lottie emotes a player can place on the emote bar. */
	EMOTE_PACK = "EMOTE_PACK",
	/** A layered card frame kit the client composes cards from. */
	CARD_FRAME = "CARD_FRAME",
}

/** Types worn through the one-item-per-type loadout; an EMOTE_PACK is picked emote by emote. */
export function isEquippableType(type: CosmeticType): boolean {
	return type !== CosmeticType.EMOTE_PACK;
}
