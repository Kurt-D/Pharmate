/**
 * Prescription photo upload (Sprint 5, D-K).
 *
 * IMPORTANT: only the CLIENT-REDACTED image is ever uploaded. The unredacted
 * original never leaves the device (client-side crop/blur happens before this
 * endpoint is called). The server stores the redacted file in UPLOADS_DIR and
 * purges it 7 days after the validation decision.
 *
 * Files are written with a random name (never the patient's) and validated by
 * MIME type + size. multipart field name: "photo".
 */
import multer from 'multer';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) || '.bin';
    cb(null, `rx_${randomBytes(16).toString('hex')}${ext}`);
  },
});

export const uploadPrescription = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WebP images are accepted'));
    }
    cb(null, true);
  },
}).single('photo');

export { UPLOADS_DIR };
