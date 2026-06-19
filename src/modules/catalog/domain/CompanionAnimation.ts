export type CompanionRole =
	| "idle"
	| "spawn"
	| "speak"
	| "hit"
	| "summon"
	| "attack"
	| "cast"
	| "defeat";

export interface CompanionAnimationDescriptor {
	clips?: Partial<Record<CompanionRole, string>>; // role -> exact animation-group name in the file
	rigFile?: string; // external rig basename, e.g. "Rig_Medium_General.glb"
	targetHeight?: number; // bbox target world height
	orientationOffsetY?: number; // per-model Y-rotation offset
}
