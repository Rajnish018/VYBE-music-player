import {
  Router,
} from 'express';

import {
  getArtists,
  getArtist,
  createArtist,
  updateArtist,
  deleteArtist,
} from '../controller/artist.controller';

import {
  authenticate,
  requireAdmin,
} from '../middleware/auth';

import {
  artistUpload,
} from '../middleware/artistUpload';

const router =
  Router();

/*
|--------------------------------------------------------------------------
| ADMIN ARTIST ROUTES
|--------------------------------------------------------------------------
|
| Mounted:
|
| app.use(
|   '/api/admin/artists',
|   artistRoutes
| );
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| GET ALL
|--------------------------------------------------------------------------
|
| GET /api/admin/artists
|
| Optional:
|
| /api/admin/artists?search=arijit
|
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  authenticate,
  requireAdmin,
  getArtists,
);

/*
|--------------------------------------------------------------------------
| GET SINGLE
|--------------------------------------------------------------------------
|
| GET /api/admin/artists/:id
|
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  authenticate,
  requireAdmin,
  getArtist,
);

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
|
| POST /api/admin/artists
|
| Content-Type:
|
| multipart/form-data
|
| Fields:
|
| name
| description
| cover
|
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  authenticate,
  requireAdmin,
  artistUpload.single(
    'cover',
  ),
  createArtist,
);

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
|
| PATCH /api/admin/artists/:id
|
| Content-Type:
|
| multipart/form-data
|
| Optional fields:
|
| name
| description
| cover
|
| IMPORTANT:
|
| If "cover" is not sent:
|
| existing artwork remains unchanged.
|
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  artistUpload.single(
    'cover',
  ),
  updateArtist,
);

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
|
| DELETE /api/admin/artists/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  deleteArtist,
);

export default router;