import { S3Client } from "bun";
import * as dotenv from "dotenv";
import { extname } from "node:path";

dotenv.config();

const USAGE =
	"Usage: bun run upload:cosmetic-asset <local-file> <r2-key>\n" +
	"Example: bun run upload:cosmetic-asset stages/kagura-castle/surface.webp playmats/kagura-castle/surface.webp";

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
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		case ".json":
			return "application/json";
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

// R2 answers HEAD with a 0 content-length for some small objects (seen with theme.json),
// so the stored size is taken from a listing instead of stat().
async function storedSize(objectKey: string): Promise<number | undefined> {
	const listed = await client.list({ prefix: objectKey });
	return listed.contents?.find((object) => object.key === objectKey)?.size;
}

const existing = await storedSize(key);
if (existing !== undefined && existing > 0) {
	throw new Error(`Refusing to overwrite existing R2 object "${key}" (${existing} bytes)`);
}
if (existing === 0) console.log(`Replacing empty R2 object "${key}"`);

// Read the bytes first: handing the BunFile straight to S3 uploaded small files empty.
const bytes = await source.bytes();
const written = await client.write(key, bytes, { type: contentTypeFor(localPath) });
const uploaded = await storedSize(key);
if (written !== bytes.length || uploaded !== bytes.length) {
	throw new Error(
		`Upload size mismatch for "${key}": local=${bytes.length}, write=${written}, remote=${uploaded ?? "missing"}`,
	);
}

console.log(`Uploaded ${key} (${uploaded} bytes)`);
