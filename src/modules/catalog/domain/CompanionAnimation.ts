export type CompanionRole =
	| "idle"
	| "spawn"
	| "speak"
	| "hit"
	| "summon"
	| "attack"
	| "cast"
	| "victory"
	| "defeat";

export type CompanionMotionPreset = "grounded" | "hover" | "serpentine" | "bouncy";

/**
 * Model-agnostic procedural personality. The game resolves the preset into safe
 * movement values; intensity affects displacement and speed affects duration.
 */
export interface CompanionMotionDescriptor {
	preset: CompanionMotionPreset;
	intensity?: number;
	speed?: number;
}

export interface CompanionAnimationDescriptor {
	clips?: Partial<Record<CompanionRole, string>>; // role -> exact animation-group name in the file
	rigFile?: string; // external rig basename, e.g. "Rig_Medium_General.glb"
	targetHeight?: number; // bbox target world height
	orientationOffsetY?: number; // per-model Y-rotation offset
	motion?: CompanionMotionDescriptor; // procedural fallback personality
}
