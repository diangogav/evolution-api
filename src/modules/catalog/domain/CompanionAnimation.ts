export type CompanionRole =
	| "idle"
	| "spawn"
	| "speak"
	| "hit"
	| "summon"
	| "attack"
	| "cast"
	| "knockdown"
	| "recover"
	| "victory"
	| "defeat";

export type CompanionMotionPreset = "grounded" | "hover" | "serpentine" | "bouncy";

/** Visual language of the direct companion-to-companion attack. */
export type CompanionAttackStyle = "magic" | "breath" | "projectile";

/**
 * Emission point in companion-local presentation units. X moves sideways,
 * Y rises from the ground anchor, and Z moves forward in the model's facing.
 */
export interface CompanionAttackOrigin {
	x: number;
	y: number;
	z: number;
}

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
	attackStyle?: CompanionAttackStyle; // direct-attack visual identity
	attackOrigin?: CompanionAttackOrigin; // local emission point (head, hand, weapon, etc.)
	attackReleaseTime?: number; // seconds from clip start until the client-owned effect launches
}
