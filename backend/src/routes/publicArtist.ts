import {
  Router,
} from 'express';

import {
  getPublicArtists,
  getPublicArtist,
} from '../controller/artist.controller';

import {
  authenticate,
} from '../middleware/auth';

const router = Router();

/*
|--------------------------------------------------------------------------
| USER ARTIST ROUTES
|--------------------------------------------------------------------------
|
| Mounted:
|
| app.use(
|   '/api/artists',
|   publicArtistRoutes,
| );
|
| These routes are READ ONLY.
|
| Normal authenticated users can see:
|
| - artist id
| - artist name
| - normalized name
| - cover URL
| - description
| - track count
|
| They cannot:
|
| - create artists
| - edit artists
| - delete artists
| - upload artwork
|
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  authenticate,
  getPublicArtists,
);

router.get(
  '/:id',
  authenticate,
  getPublicArtist,
);

export default router;