import { t } from "elysia";

// Only "an object of strings" here: the shape rules (key and value patterns, entry count) live in
// the domain factory, which answers 400 with a precise message.
export const AvatarConfigSchema = t.Record(t.String(), t.String());

export const MyAvatarSchema = t.Object({ config: AvatarConfigSchema });

export const PublicAvatarsSchema = t.Object({
	avatars: t.Array(t.Object({ userId: t.String(), config: AvatarConfigSchema })),
});
