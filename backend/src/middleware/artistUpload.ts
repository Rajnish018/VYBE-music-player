import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDirectory =
  path.resolve(
    process.cwd(),
    'uploads',
    'artists',
  );

/*
|--------------------------------------------------------------------------
| CREATE DIRECTORY
|--------------------------------------------------------------------------
*/

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(
    uploadDirectory,
    {
      recursive: true,
    },
  );
}

/*
|--------------------------------------------------------------------------
| STORAGE
|--------------------------------------------------------------------------
|
| Files are permanently stored on the backend server:
|
| uploads/
|   artists/
|     artist-uuid.jpg
|
|--------------------------------------------------------------------------
*/

const storage =
  multer.diskStorage({
    destination:
      (_req, _file, callback) => {
        callback(
          null,
          uploadDirectory,
        );
      },

    filename:
      (_req, file, callback) => {
        const extension =
          path.extname(
            file.originalname,
          ).toLowerCase();

        const uniqueName =
          `artist-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}${extension}`;

        callback(
          null,
          uniqueName,
        );
      },
  });

/*
|--------------------------------------------------------------------------
| FILE FILTER
|--------------------------------------------------------------------------
*/

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
) {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  if (
    !allowedMimeTypes.includes(
      file.mimetype,
    )
  ) {
    callback(
      new Error(
        'Only JPG, PNG, WEBP and GIF images are allowed.',
      ),
    );

    return;
  }

  callback(
    null,
    true,
  );
}

/*
|--------------------------------------------------------------------------
| MULTER
|--------------------------------------------------------------------------
*/

export const artistUpload =
  multer({
    storage,
    fileFilter,
    limits: {
      fileSize:
        10 * 1024 * 1024,
      files: 1,
    },
  });