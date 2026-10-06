import {

  Request,

  Response,

  NextFunction,

} from 'express';



import {

  Prisma,

} from '@prisma/client';



import fs from 'fs/promises';

import path from 'path';



import {

  prisma,

} from '../config/db';



import {

  normalizeArtistEntityName,

} from '../services/artistService';



import {

  invalidateTrackCache,

} from '../services/redisService';



/*

|--------------------------------------------------------------------------

| TYPES

|--------------------------------------------------------------------------

*/



type ArtistRequest =

  Request & {

    file?: Express.Multer.File;

  };



/*

|--------------------------------------------------------------------------

| FILE HELPERS

|--------------------------------------------------------------------------

*/



function isLocalArtistFile(

  coverUrl: string | null | undefined,

): boolean {

  if (!coverUrl) {

    return false;

  }



  return coverUrl.includes(

    '/uploads/artists/',

  );

}



async function deleteArtistFile(

  coverUrl: string | null | undefined,

): Promise<void> {

  if (

    !coverUrl ||

    !isLocalArtistFile(

      coverUrl,

    )

  ) {

    return;

  }



  try {

    const pathname =

      new URL(

        coverUrl,

        'http://localhost',

      ).pathname;



    const uploadsRoot =

      path.resolve(

        process.cwd(),

        'uploads',

        'artists',

      );



    const filename =

      path.basename(

        pathname,

      );



    const filePath =

      path.resolve(

        uploadsRoot,

        filename,

      );



    /*

     * Security:

     *

     * Ensure the resolved file remains

     * inside uploads/artists.

     */

    if (

      !filePath.startsWith(

        `${uploadsRoot}${path.sep}`,

      )

    ) {

      return;

    }



    await fs.unlink(

      filePath,

    );

  } catch (error: any) {

    /*

     * File may already be deleted.

     *

     * Do not make the database operation

     * fail only because cleanup failed.

     */

    if (

      error?.code !==

      'ENOENT'

    ) {

      console.error(

        'Failed to delete artist artwork:',

        error,

      );

    }

  }

}



function getPublicBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
  return configuredBaseUrl || `${req.protocol}://${req.get('host')}`;
}

function buildCoverUrl(
  req: Request,
  filename: string,
): string {
  const baseUrl = getPublicBaseUrl(req);
  return `${baseUrl}/uploads/artists/${encodeURIComponent(filename)}`;
}

function normalizeArtistCoverUrl(
  req: Request,
  coverUrl: string | null | undefined,
): string | null {
  if (!coverUrl) return null;
  const baseUrl = getPublicBaseUrl(req);
  if (coverUrl.startsWith(`${baseUrl}/uploads/artists/`)) return coverUrl;
  if (coverUrl.startsWith('http://localhost:3000/uploads/artists/') ||
      coverUrl.startsWith('http://127.0.0.1:3000/uploads/artists/')) {
    try {
      return `${baseUrl}${new URL(coverUrl).pathname}`;
    } catch {
      return coverUrl;
    }
  }
  if (coverUrl.startsWith('/uploads/artists/')) return `${baseUrl}${coverUrl}`;
  return coverUrl;
}



/*

|--------------------------------------------------------------------------

| GET ALL ARTISTS

|--------------------------------------------------------------------------

|

| GET /api/admin/artists

|

|--------------------------------------------------------------------------

*/



export async function getArtists(

  req: Request,

  res: Response,

  next: NextFunction,

) {

  try {

    const search =

      typeof req.query.search ===

      'string'

        ? req.query.search.trim()

        : '';



    const artists =

      await prisma.artist.findMany({

        where: search

          ? {

              OR: [

                {

                  name: {

                    contains:

                      search,

                    mode: 'insensitive',

                  },

                },

                {

                  normalizedName: {

                    contains:

                      normalizeArtistEntityName(

                        search,

                      ),

                  },

                },

              ],

            }

          : undefined,



        include: {

          _count: {

            select: {

              tracks: true,

            },

          },

        },



        orderBy: {

          name: 'asc',

        },

      });



    return res.status(200).json({

      artists:

        artists.map(

          (artist) => ({

            id: artist.id,



            name: artist.name,



            normalizedName:

              artist.normalizedName,



            description:

              artist.description,



            coverUrl:

              normalizeArtistCoverUrl(req, artist.coverUrl),



            coverMimeType:

              artist.coverMimeType,



            coverUpdatedAt:

              artist.coverUpdatedAt,



            trackCount:

              artist._count.tracks,



            createdAt:

              artist.createdAt,



            updatedAt:

              artist.updatedAt,

          }),

        ),

    });

  } catch (error) {

    next(error);

  }

}



/*

|--------------------------------------------------------------------------

| GET SINGLE ARTIST

|--------------------------------------------------------------------------

|

| GET /api/admin/artists/:id

|

|--------------------------------------------------------------------------

*/



export async function getArtist(

  req: Request,

  res: Response,

  next: NextFunction,

) {

  try {

    const {

      id,

    } = req.params;



    const artist =

      await prisma.artist.findUnique({

        where: {

          id,

        },



        include: {

          _count: {

            select: {

              tracks: true,

            },

          },



          tracks: {

            include: {

              track: {

                select: {

                  id: true,

                  title: true,

                  artist: true,

                  thumbnailUrl: true,

                  duration: true,

                  album: true,

                },

              },

            },



            orderBy: {

              track: {

                title: 'asc',

              },

            },

          },

        },

      });



    if (!artist) {

      return res.status(404).json({

        error:

          'ARTIST_NOT_FOUND',

        message:

          'Artist not found',

      });

    }



    return res.status(200).json({

      artist: {

        id: artist.id,



        name: artist.name,



        normalizedName:

          artist.normalizedName,



        description:

          artist.description,



        coverUrl:

          normalizeArtistCoverUrl(req, artist.coverUrl),



        coverMimeType:

          artist.coverMimeType,



        coverUpdatedAt:

          artist.coverUpdatedAt,



        trackCount:

          artist._count.tracks,



        tracks:

          artist.tracks.map(

            (item) => ({

              id: item.track.id,



              title:

                item.track.title,



              artist:

                item.track.artist,



              thumbnailUrl:

                item.track

                  .thumbnailUrl,



              duration:

                item.track.duration,



              album:

                item.track.album,

            }),

          ),



        createdAt:

          artist.createdAt,



        updatedAt:

          artist.updatedAt,

      },

    });

  } catch (error) {

    next(error);

  }

}



/*

|--------------------------------------------------------------------------

| CREATE ARTIST

|--------------------------------------------------------------------------

|

| POST /api/admin/artists

|

| multipart/form-data

|

| name

| description

| cover

|

|--------------------------------------------------------------------------

*/



export async function createArtist(

  req: ArtistRequest,

  res: Response,

  next: NextFunction,

) {

  let uploadedFilePath:

    string | null = null;



  try {

    const {

      name,

      description,

    } = req.body || {};



    const file =

      req.file;



    if (

      typeof name !==

        'string' ||

      !name.trim()

    ) {

      if (file?.path) {

        uploadedFilePath =

          file.path;

      }



      return res.status(400).json({

        error:

          'ARTIST_NAME_REQUIRED',

        message:

          'Artist name is required',

      });

    }



    const cleanName =

      name

        .normalize('NFKC')

        .trim()

        .replace(

          /\s+/g,

          ' ',

        );



    if (

      !cleanName

    ) {

      return res.status(400).json({

        error:

          'ARTIST_NAME_REQUIRED',

        message:

          'Artist name is required',

      });

    }



    if (

      cleanName.length >

      150

    ) {

      return res.status(400).json({

        error:

          'ARTIST_NAME_TOO_LONG',

        message:

          'Artist name cannot exceed 150 characters',

      });

    }



    const normalizedName =

      normalizeArtistEntityName(

        cleanName,

      );



    if (

      !normalizedName

    ) {

      return res.status(400).json({

        error:

          'INVALID_ARTIST_NAME',

        message:

          'Invalid artist name',

      });

    }



    /*

     * Description

     */



    let cleanDescription:

      string | null = null;



    if (

      description !==

        undefined &&

      description !==

        null

    ) {

      cleanDescription =

        String(

          description,

        ).trim();



      if (

        cleanDescription.length >

        1000

      ) {

        return res.status(400).json({

          error:

            'DESCRIPTION_TOO_LONG',

          message:

            'Artist description cannot exceed 1000 characters',

        });

      }

    }



    /*

     * Duplicate

     */



    const existingArtist =

      await prisma.artist.findUnique({

        where: {

          normalizedName,

        },

      });



    if (existingArtist) {

      return res.status(409).json({

        error:

          'ARTIST_ALREADY_EXISTS',



        message:

          'An artist with this name already exists.',



        artist: {

          id:

            existingArtist.id,



          name:

            existingArtist.name,

        },

      });

    }



    /*

     * Artwork

     */



    let coverUrl:

      string | null = null;



    let coverMimeType:

      string | null = null;



    let coverUpdatedAt:

      Date | null = null;



    if (file) {

      coverUrl =

        buildCoverUrl(

          req,

          file.filename,

        );



      coverMimeType =

        file.mimetype;



      coverUpdatedAt =

        new Date();



      uploadedFilePath =

        file.path;

    }



    /*

     * Create artist

     */



    const artist =

      await prisma.artist.create({

        data: {

          name:

            cleanName,



          normalizedName,



          description:

            cleanDescription,



          coverUrl,



          coverMimeType,



          coverUpdatedAt,

        },



        include: {

          _count: {

            select: {

              tracks: true,

            },

          },

        },

      });



    uploadedFilePath =

      null;



    return res.status(201).json({

      message:

        'Artist created successfully',



      artist: {

        id: artist.id,



        name:

          artist.name,



        normalizedName:

          artist.normalizedName,



        description:

          artist.description,



        coverUrl:

          normalizeArtistCoverUrl(req, artist.coverUrl),



        coverMimeType:

          artist.coverMimeType,



        coverUpdatedAt:

          artist.coverUpdatedAt,



        trackCount:

          artist._count.tracks,



        createdAt:

          artist.createdAt,



        updatedAt:

          artist.updatedAt,

      },

    });

  } catch (error) {

    /*

     * If database creation failed,

     * remove uploaded image.

     */

    if (uploadedFilePath) {

      try {

        await fs.unlink(

          uploadedFilePath,

        );

      } catch {}

    }



    if (

      error instanceof

        Prisma.PrismaClientKnownRequestError &&

      error.code ===

        'P2002'

    ) {

      return res.status(409).json({

        error:

          'ARTIST_ALREADY_EXISTS',



        message:

          'An artist with this name already exists.',

      });

    }



    next(error);

  }

}



/*

|--------------------------------------------------------------------------

| UPDATE ARTIST

|--------------------------------------------------------------------------

|

| PATCH /api/admin/artists/:id

|

| multipart/form-data

|

| name       optional

| description optional

| cover      optional

|

| IMPORTANT:

|

| No cover file =

| existing artwork stays untouched.

|

|--------------------------------------------------------------------------

*/



export async function updateArtist(

  req: ArtistRequest,

  res: Response,

  next: NextFunction,

) {

  let uploadedFilePath:

    string | null = null;



  try {

    const {

      id,

    } = req.params;



    const existingArtist =

      await prisma.artist.findUnique({

        where: {

          id,

        },

      });



    if (!existingArtist) {

      return res.status(404).json({

        error:

          'ARTIST_NOT_FOUND',



        message:

          'Artist not found',

      });

    }



    const {

      name,

      description,

    } = req.body || {};



    const file =

      req.file;



    /*

     * At least one field must exist.

     */



    if (

      name === undefined &&

      description === undefined &&

      !file

    ) {

      return res.status(400).json({

        error:

          'NOTHING_TO_UPDATE',



        message:

          'Nothing to update',

      });

    }



    /*

     * NAME

     */



    let cleanName =

      existingArtist.name;



    let normalizedName =

      existingArtist.normalizedName;



    if (

      name !== undefined

    ) {

      if (

        typeof name !==

          'string' ||

        !name.trim()

      ) {

        return res.status(400).json({

          error:

            'INVALID_ARTIST_NAME',



          message:

            'Artist name cannot be empty',

        });

      }



      cleanName =

        name

          .normalize('NFKC')

          .trim()

          .replace(

            /\s+/g,

            ' ',

          );



      if (

        cleanName.length >

        150

      ) {

        return res.status(400).json({

          error:

            'ARTIST_NAME_TOO_LONG',



          message:

            'Artist name cannot exceed 150 characters',

        });

      }



      normalizedName =

        normalizeArtistEntityName(

          cleanName,

        );



      const duplicate =

        await prisma.artist.findFirst({

          where: {

            normalizedName,



            NOT: {

              id,

            },

          },

        });



      if (duplicate) {

        return res.status(409).json({

          error:

            'ARTIST_ALREADY_EXISTS',



          message:

            'Another artist with this name already exists.',



          artist: {

            id:

              duplicate.id,



            name:

              duplicate.name,

          },

        });

      }

    }



    /*

     * DESCRIPTION

     *

     * Important:

     *

     * undefined means:

     * don't change it.

     *

     * null/empty string means:

     * clear it.

     */



    let nextDescription =

      existingArtist.description;



    if (

      description !==

      undefined

    ) {

      const value =

        String(

          description ??

            '',

        ).trim();



      if (

        value.length >

        1000

      ) {

        return res.status(400).json({

          error:

            'DESCRIPTION_TOO_LONG',



          message:

            'Artist description cannot exceed 1000 characters',

        });

      }



      nextDescription =

        value || null;

    }



    /*

     * ARTWORK

     *

     * Existing artwork remains

     * completely unchanged unless

     * a NEW file is uploaded.

     */



    let nextCoverUrl =

      existingArtist.coverUrl;



    let nextCoverMimeType =

      existingArtist.coverMimeType;



    let nextCoverUpdatedAt =

      existingArtist.coverUpdatedAt;



    let oldCoverUrl:

      string | null =

        null;



    if (file) {

      uploadedFilePath =

        file.path;



      oldCoverUrl =

        existingArtist.coverUrl;



      nextCoverUrl =

        buildCoverUrl(

          req,

          file.filename,

        );



      nextCoverMimeType =

        file.mimetype;



      nextCoverUpdatedAt =

        new Date();

    }



    /*

     * DATABASE TRANSACTION

     */



    const result =

      await prisma.$transaction(

        async (tx) => {

          const artist =

            await tx.artist.update({

              where: {

                id,

              },



              data: {

                /*

                 * Only update values that

                 * should actually change.

                 */

                ...(name !==

                undefined

                  ? {

                      name:

                        cleanName,



                      normalizedName,

                    }

                  : {}),



                ...(description !==

                undefined

                  ? {

                      description:

                        nextDescription,

                    }

                  : {}),



                ...(file

                  ? {

                      coverUrl:

                        nextCoverUrl,



                      coverMimeType:

                        nextCoverMimeType,



                      coverUpdatedAt:

                        nextCoverUpdatedAt,

                    }

                  : {}),

              },

            });



          /*

           * If artist name changed,

           * synchronize Track records.

           */



          if (

            existingArtist.normalizedName !==

            normalizedName

          ) {

            const relationships =

              await tx.trackArtist.findMany({

                where: {

                  artistId:

                    id,

                },



                select: {

                  trackId:

                    true,

                },

              });



            for (

              const relationship of relationships

            ) {

              const track =

                await tx.track.findUnique({

                  where: {

                    id:

                      relationship.trackId,

                  },



                  select: {

                    id: true,

                    artist: true,

                    normalizedArtist:

                      true,

                  },

                });



              if (!track) {

                continue;

              }



              const artistParts =

                track.artist

                  .split(',')

                  .map(

                    (value) =>

                      value.trim(),

                  )

                  .filter(

                    Boolean,

                  );



              const updatedParts =

                artistParts.map(

                  (

                    artistPart,

                  ) => {

                    if (

                      normalizeArtistEntityName(

                        artistPart,

                      ) ===

                      existingArtist.normalizedName

                    ) {

                      return cleanName;

                    }



                    return artistPart;

                  },

                );



              const updatedArtist =

                [

                  ...new Set(

                    updatedParts,

                  ),

                ].join(', ');



              const updatedNormalizedArtist =

                updatedArtist

                  .split(',')

                  .map(

                    (value) =>

                      normalizeArtistEntityName(

                        value,

                      ),

                  )

                  .filter(

                    Boolean,

                  )

                  .join(', ');



              await tx.track.update({

                where: {

                  id:

                    track.id,

                },



                data: {

                  artist:

                    updatedArtist,



                  normalizedArtist:

                    updatedNormalizedArtist,

                },

              });

            }

          }



          return artist;

        },

      );



    /*

     * New database state is committed.

     */



    uploadedFilePath =

      null;



    /*

     * Delete OLD artwork only after

     * successful database update.

     */



    if (

      file &&

      oldCoverUrl &&

      oldCoverUrl !==

        nextCoverUrl

    ) {

      await deleteArtistFile(

        oldCoverUrl,

      );

    }



    /*

     * Find linked tracks for cache

     * invalidation.

     */



    const linkedTracks =

      await prisma.trackArtist.findMany({

        where: {

          artistId:

            id,

        },



        select: {

          trackId:

            true,

        },

      });



    await Promise.all(

      linkedTracks.map(

        (track) =>

          invalidateTrackCache(

            track.trackId,

          ),

      ),

    );



    const trackCount =

      await prisma.trackArtist.count({

        where: {

          artistId:

            id,

        },

      });



    return res.status(200).json({

      message:

        'Artist updated successfully',



      artist: {

        id:

          result.id,



        name:

          result.name,



        normalizedName:

          result.normalizedName,



        description:

          result.description,



        coverUrl:

          normalizeArtistCoverUrl(req, result.coverUrl),



        coverMimeType:

          result.coverMimeType,



        coverUpdatedAt:

          result.coverUpdatedAt,



        trackCount,



        createdAt:

          result.createdAt,



        updatedAt:

          result.updatedAt,

      },

    });

  } catch (error) {

    /*

     * New image was uploaded but DB

     * update failed.

     *

     * Remove the new file.

     */



    if (uploadedFilePath) {

      try {

        await fs.unlink(

          uploadedFilePath,

        );

      } catch {}

    }



    if (

      error instanceof

        Prisma.PrismaClientKnownRequestError

    ) {

      if (

        error.code ===

        'P2002'

      ) {

        return res.status(409).json({

          error:

            'ARTIST_UPDATE_CONFLICT',



          message:

            'This artist name would create a duplicate track. Rename the artist carefully and try again.',

        });

      }

    }



    next(error);

  }

}



/*

|--------------------------------------------------------------------------

| DELETE ARTIST

|--------------------------------------------------------------------------

|

| DELETE /api/admin/artists/:id

|

|--------------------------------------------------------------------------

*/



export async function deleteArtist(

  req: Request,

  res: Response,

  next: NextFunction,

) {

  try {

    const {

      id,

    } = req.params;



    const artist =

      await prisma.artist.findUnique({

        where: {

          id,

        },



        include: {

          _count: {

            select: {

              tracks: true,

            },

          },

        },

      });



    if (!artist) {

      return res.status(404).json({

        error:

          'ARTIST_NOT_FOUND',



        message:

          'Artist not found',

      });

    }



    /*

     * Save artwork URL before deleting

     * the database record.

     */



    const coverUrl =

      artist.coverUrl;



    /*

     * Because TrackArtist has:

     *

     * onDelete: Cascade

     *

     * deleting Artist will automatically

     * remove TrackArtist relationships.

     *

     * Tracks themselves are NOT deleted.

     */



    await prisma.artist.delete({

      where: {

        id,

      },

    });



    /*

     * Delete physical artwork after

     * successful DB deletion.

     */



    await deleteArtistFile(

      coverUrl,

    );



    return res.status(200).json({

      message:

        'Artist deleted successfully',



      artist: {

        id:

          artist.id,



        name:

          artist.name,

      },

    });

  } catch (error) {

    next(error);

  }

}

/*

|--------------------------------------------------------------------------

| GET PUBLIC ARTISTS

|--------------------------------------------------------------------------

|

| GET /api/artists

|

| Authenticated users only.

|

| READ ONLY.

|

|--------------------------------------------------------------------------

*/



export async function getPublicArtists(

  req: Request,

  res: Response,

) {

  try {

    const search =

      typeof req.query.search === 'string'

        ? req.query.search.trim()

        : '';



    const artists =

      await prisma.artist.findMany({

        where: search

          ? {

              OR: [

                {

                  name: {

                    contains: search,

                    mode: 'insensitive',

                  },

                },

                {

                  normalizedName: {

                    contains:

                      search.toLowerCase(),

                  },

                },

              ],

            }

          : undefined,



        select: {

          id: true,

          name: true,

          normalizedName: true,

          coverUrl: true,

          description: true,



          _count: {

            select: {

              tracks: true,

            },

          },

        },



        orderBy: {

          name: 'asc',

        },

      });



    return res.json({

      artists: artists.map(

        (artist) => ({

          id: artist.id,



          name: artist.name,



          normalizedName:

            artist.normalizedName,



          coverUrl:

            normalizeArtistCoverUrl(req, artist.coverUrl),



          description:

            artist.description,



          trackCount:

            artist._count.tracks,

        }),

      ),

    });

  } catch (error) {

    console.error(

      '[PUBLIC ARTISTS] Failed to load artists:',

      error,

    );



    return res.status(500).json({

      message:

        'Failed to load artists',

    });

  }

}





/*

|--------------------------------------------------------------------------

| GET PUBLIC ARTIST

|--------------------------------------------------------------------------

|

| GET /api/artists/:id

|

| Authenticated users only.

|

|--------------------------------------------------------------------------

*/



export async function getPublicArtist(

  req: Request,

  res: Response,

) {

  try {

    const {

      id,

    } = req.params;



    const artist =

      await prisma.artist.findUnique({

        where: {

          id,

        },



        select: {

          id: true,

          name: true,

          normalizedName: true,

          coverUrl: true,

          description: true,



          _count: {

            select: {

              tracks: true,

            },

          },

        },

      });



    if (!artist) {

      return res.status(404).json({

        message:

          'Artist not found',

      });

    }



    return res.json({

      artist: {

        id: artist.id,



        name: artist.name,



        normalizedName:

          artist.normalizedName,



        coverUrl:

          normalizeArtistCoverUrl(req, artist.coverUrl),



        description:

          artist.description,



        trackCount:

          artist._count.tracks,

      },

    });

  } catch (error) {

    console.error(

      '[PUBLIC ARTIST] Failed to load artist:',

      error,

    );



    return res.status(500).json({

      message:

        'Failed to load artist',

    });

  }

}
