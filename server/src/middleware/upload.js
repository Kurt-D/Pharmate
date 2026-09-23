/**
 * Prescription photo upload (Sprint 5, D-K).
 *
 * IMPORTANT: only the CLIENT-REDACTED image is ever uploaded. The unredacted
 * original never leaves the device (client-side crop/blur happens before this
 * endpoint is called). The server stores the redacted file in UPLOADS_DIR and
 * purges it 7 days after the validation decision.
 *
 * MIME type and filename are untrusted. Accepted files are decoded and
 * re-encoded server-side without EXIF/GPS metadata. multipart field: "photo".
 */
import multer from 'multer';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import sharp from 'sharp';
import { createUploadsDir } from '../db/connection.js';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 6000;
const MAX_PIXELS = 24_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

createUploadsDir();

const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 20, fieldSize: 32 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype || '')) {
      return cb(new Error('Only JPEG, PNG, or WebP images are accepted'));
    }
    cb(null, true);
  },
}).single('photo');

async function sanitizePrescription(req) {
  if (!req.file) return;
  let metadata;
  try {
    metadata = await sharp(req.file.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new Error('The uploaded file is not a valid supported image');
  }
  const { format, width, height } = metadata;
  if (!ACCEPTED_FORMATS.has(format)) throw new Error('Only JPEG, PNG, or WebP images are accepted');
  if (!width || !height || width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new Error(`Image dimensions must be at least ${MIN_DIMENSION}x${MIN_DIMENSION}`);
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error('Image dimensions are too large');
  }
  // Calling no withMetadata() drops EXIF/GPS and all source metadata.
  const output = await sharp(req.file.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  if (!output.length || output.length > MAX_BYTES) throw new Error('Sanitized image exceeds the size limit');
  const filename = `rx_${randomBytes(16).toString('hex')}.jpg`;
  const target = path.join(UPLOADS_DIR, filename);
  await writeFile(target, output, { flag: 'wx', mode: 0o600 });
  req.file.filename = filename;
  req.file.path = target;
  req.file.mimetype = 'image/jpeg';
  req.file.size = output.length;
}

export function uploadPrescription(req, res, next) {
  receive(req, res, async (error) => {
    if (error) return next(error);
    try {
      await sanitizePrescription(req);
      return next();
    } catch (sanitizeError) {
      return next(sanitizeError);
    }
  });
}

export async function removeUploadedPrescription(file) {
  if (!file?.filename) return;
  const target = path.resolve(UPLOADS_DIR, path.basename(file.filename));
  if (target.startsWith(`${UPLOADS_DIR}${path.sep}`)) await unlink(target).catch(() => {});
}

export { UPLOADS_DIR };
