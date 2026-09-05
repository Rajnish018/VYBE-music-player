import multer from 'multer';
import path from 'path';
import fs from 'fs';

/*
 * ============================================================
 * Admin upload middleware
 *
 * Supported multipart fields:
 *   audio -> one audio file
 *   cover -> one image file
 * ============================================================
 */

const allowedAudioExtensions = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
]);

const allowedAudioMimeTypes = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-mpeg-3',
  'audio/x-mp3',
  'audio/x-wav',
]);

const allowedCoverExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);

const allowedCoverMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/*
 * Temporary upload directory.
 * This resolves to backend/tmp in the compiled application.
 */
const uploadDir = path.join(__dirname, '../../tmp');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const uniqueSuffix =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const extension = path.extname(file.originalname).toLowerCase();

    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${extension}`,
    );
  },
});

const fileFilter: multer.Options['fileFilter'] = (
  _req,
  file,
  cb,
) => {
  const ext = path.extname(file.originalname).toLowerCase();

  /* ---------------- AUDIO ---------------- */
  if (file.fieldname === 'audio') {
    if (!allowedAudioExtensions.has(ext)) {
      return cb(
        new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'audio'),
      );
    }

    if (!allowedAudioMimeTypes.has(file.mimetype.toLowerCase())) {
      return cb(
        new Error(
          `Invalid audio MIME type: ${file.mimetype}.`,
        ),
      );
    }

    return cb(null, true);
  }

  /* ---------------- COVER ---------------- */
  if (file.fieldname === 'cover') {
    if (!allowedCoverExtensions.has(ext)) {
      return cb(
        new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'cover'),
      );
    }

    if (!allowedCoverMimeTypes.has(file.mimetype.toLowerCase())) {
      return cb(
        new Error(
          `Invalid cover MIME type: ${file.mimetype}. Supported: JPG, JPEG, PNG, WEBP, GIF.`,
        ),
      );
    }

    return cb(null, true);
  }

  /* Any other multipart field is rejected. */
  return cb(
    new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname),
  );
};

/*
 * Base uploader.
 * Use upload.single('audio') for audio-only endpoints.
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 2,
  },
  fileFilter,
});

/*
 * Main admin track uploader.
 * Accepts:
 *   audio: required, max 1
 *   cover: optional, max 1
 */
export const adminTrackUpload = upload.fields([
  {
    name: 'audio',
    maxCount: 1,
  },
  {
    name: 'cover',
    maxCount: 1,
  },
]);

export default upload;
