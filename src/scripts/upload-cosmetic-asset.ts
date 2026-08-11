import { S3Client } from "bun";
import * as dotenv from "dotenv";
import { extname } from "node:path";

dotenv.config();

const USAGE =
	"Usage: bun run upload:cosmetic-asset <local-file> <r2-key>\n" +
	"Example: bun run upload:cosmetic-asset assets/playmats/magma-forge/magma-forge.glb playmats/magma-forge/magma-forge.glb";

const [localPath, key] = process.argv.slice(2);
if (!localPath || !key) throw new Error(USAGE);
if (key.startsWith("/") || key.includes("..") || !key.includes("/")) {
	throw new Error(`Invalid R2 key "${key}". Keys must be relative cosmetic paths.`);
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Environment variable ${name} is not set`);
	return value;
}

function contentTypeFor(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".glb":
			return "model/gltf-binary";
		case ".gltf":
			return "model/gltf+json";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

const source = Bun.file(localPath);
if (!(await source.exists())) throw new Error(`Local asset "${localPath}" does not exist`);

const client = new S3Client({
	accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
	secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
	bucket: requiredEnv("R2_BUCKET"),
	endpoint: requiredEnv("R2_ENDPOINT"),
});

const target = client.file(key);
if (await target.exists()) {
	const current = await target.stat();
	throw new Error(`Refusing to overwrite existing R2 object "${key}" (${current.size} bytes)`);
}

const written = await client.write(key, source, { type: contentTypeFor(localPath) });
const uploaded = await target.stat();
if (written !== source.size || uploaded.size !== source.size) {
	throw new Error(
		`Upload size mismatch for "${key}": local=${source.size}, write=${written}, remote=${uploaded.size}`,
	);
}

console.log(`Uploaded ${key} (${uploaded.size} bytes)`);
