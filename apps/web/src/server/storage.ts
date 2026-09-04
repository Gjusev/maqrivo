/**
 * Upload storage: evidence/catalogue photos on the local volume.
 * Size-capped, MIME-validated; keys are namespaced by purpose.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readFile } from "node:fs/promises";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class UploadRejectedError extends Error {
  constructor(reason: string) {
    super(`upload-rejected: ${reason}`);
    this.name = "UploadRejectedError";
  }
}

function uploadRoot(): string {
  const root = process.env.UPLOAD_VOLUME_PATH ?? "./uploads";
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

export async function saveImage(
  folder: string,
  file: { mime: string; bytes: Uint8Array },
): Promise<{ storageKey: string; contentHash: string }> {
  if (!ALLOWED_MIME.has(file.mime)) {
    throw new UploadRejectedError(`type ${file.mime} not allowed (jpeg/png/webp)`);
  }
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_BYTES) {
    throw new UploadRejectedError("empty or larger than 8 MB");
  }
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(file.bytes).digest("hex");
  const ext = EXTENSION_BY_MIME[file.mime];
  const storageKey = `${folder}/${hash.slice(0, 16)}.${ext}`;
  const target = path.join(uploadRoot(), storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.bytes);
  return { storageKey, contentHash: hash };
}

export async function readImage(storageKey: string): Promise<Buffer> {
  // Defence against path traversal: resolve inside the upload root.
  const root = uploadRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(root + path.sep)) {
    throw new UploadRejectedError("invalid key");
  }
  return readFile(target);
}
