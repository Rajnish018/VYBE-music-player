import {
  UploadOperationType,
  UploadStatus,
} from '@prisma/client';

import { prisma } from '../config/db';
import { megaService } from './megaService';
import {
  cleanupDeletedAudioOperation,
  cleanupDeletedCoverOperation,
  cleanupDeletedTrackOperation,
  rollbackUploadOperation,
} from './rollbackService';

const DEFAULT_STALE_MINUTES = 60;
const DEFAULT_BATCH_SIZE = 50;

function toPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getRecoveryStaleMinutes(): number {
  return toPositiveInteger(
    process.env.UPLOAD_RECOVERY_STALE_MINUTES,
    DEFAULT_STALE_MINUTES,
  );
}

function getRecoveryBatchSize(): number {
  return toPositiveInteger(
    process.env.UPLOAD_RECOVERY_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
  );
}

export interface UploadRecoverySummary {
  scanned: number;
  recovered: number;
  failed: number;
  skipped: number;
}

export async function recoverStaleUploadOperations(): Promise<UploadRecoverySummary> {
  const staleMinutes = getRecoveryStaleMinutes();
  const batchSize = getRecoveryBatchSize();

  const now = new Date();

  const cutoff = new Date(
    now.getTime() - staleMinutes * 60 * 1000,
  );

  const summary: UploadRecoverySummary = {
    scanned: 0,
    recovered: 0,
    failed: 0,
    skipped: 0,
  };

  console.log(
    `[UPLOAD RECOVERY] Looking for stale operations older than ${staleMinutes} minute(s).`,
  );

  await megaService.connect();

  const operations =
    await prisma.uploadOperation.findMany({
      where: {
        status: {
          in: [
            UploadStatus.PENDING,
            UploadStatus.UPLOADING,
            UploadStatus.DB_COMMITTING,
            UploadStatus.ROLLING_BACK,
          ],
        },

        OR: [
          {
            leaseExpiresAt: {
              lt: now,
            },
          },
          {
            leaseExpiresAt: null,
            updatedAt: {
              lt: cutoff,
            },
          },
        ],
      },

      orderBy: {
        updatedAt: 'asc',
      },

      take: batchSize,

      select: {
        id: true,
        type: true,
        status: true,
        megaFolder: true,
        megaAudioNodeId: true,
        megaCoverNodeId: true,
        oldMegaAudioNodeId: true,
        oldMegaCoverNodeId: true,
        trackId: true,
        updatedAt: true,

        // Lease information
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
      },
    });

  summary.scanned = operations.length;

  if (operations.length === 0) {
    console.log(
      '[UPLOAD RECOVERY] No stale operations found.',
    );

    return summary;
  }

  console.log(
    `[UPLOAD RECOVERY] Found ${operations.length} stale operation(s).`,
  );

  for (const operation of operations) {
    try {
      /*
       * Atomic claim.
       *
       * The updatedAt check prevents two recovery workers from
       * processing the same operation simultaneously.
       *
       * The lease condition ensures we only claim an operation
       * that was actually stale when recovery selected it.
       */
      const claim =
        await prisma.uploadOperation.updateMany({
          where: {
            id: operation.id,
            status: operation.status,
            updatedAt: operation.updatedAt,

            OR: [
              {
                leaseExpiresAt: {
                  lt: new Date(),
                },
              },
              {
                leaseExpiresAt: null,
                updatedAt: {
                  lt: cutoff,
                },
              },
            ],
          },

          data: {
            status: UploadStatus.ROLLING_BACK,

            /*
             * Acquire a fresh temporary lease while the recovery
             * cleanup is running. This prevents another recovery
             * process from immediately selecting the same operation.
             */
            leaseExpiresAt: new Date(
              Date.now() + staleMinutes * 60 * 1000,
            ),
            lastHeartbeatAt: new Date(),
          },
        });

      if (claim.count !== 1) {
        summary.skipped += 1;

        console.log(
          `[UPLOAD RECOVERY] Skipping ${operation.id}; state changed before claim.`,
        );

        continue;
      }

      console.log(
        `[UPLOAD RECOVERY] Recovering ${operation.id} (type=${operation.type}, status=${operation.status}).`,
      );

      let result;

      if (
        operation.type ===
        UploadOperationType.DELETE_TRACK
      ) {
        result =
          await cleanupDeletedTrackOperation(
            operation.id,
            'Automatic startup recovery of stale DELETE_TRACK operation.',
            {
              megaFolderNodeId:
                operation.megaFolder,
              oldMegaAudioNodeId:
                operation.oldMegaAudioNodeId,
              oldMegaCoverNodeId:
                operation.oldMegaCoverNodeId,
              trackId:
                operation.trackId,
            },
          );
      } else if (
        operation.type ===
        UploadOperationType.DELETE_AUDIO
      ) {
        result =
          await cleanupDeletedAudioOperation(
            operation.id,
            'Automatic startup recovery of stale DELETE_AUDIO operation.',
            {
              megaFolderNodeId:
                operation.megaFolder,
              oldMegaAudioNodeId:
                operation.oldMegaAudioNodeId,
              trackId:
                operation.trackId,
            },
          );
      } else if (
        operation.type ===
        UploadOperationType.DELETE_COVER
      ) {
        result =
          await cleanupDeletedCoverOperation(
            operation.id,
            'Automatic startup recovery of stale DELETE_COVER operation.',
            {
              megaFolderNodeId:
                operation.megaFolder,
              oldMegaCoverNodeId:
                operation.oldMegaCoverNodeId,
              trackId:
                operation.trackId,
            },
          );
      } else {
        result =
          await rollbackUploadOperation(
            operation.id,
            `Automatic startup recovery of stale ${operation.type} upload operation.`,
            {
              megaFolderNodeId:
                operation.megaFolder,
              megaAudioNodeId:
                operation.megaAudioNodeId,
              megaCoverNodeId:
                operation.megaCoverNodeId,
              trackId:
                operation.trackId,
            },
          );
      }

      if (result.success) {
        summary.recovered += 1;

        console.log(
          `[UPLOAD RECOVERY] Operation ${operation.id} recovered successfully.`,
        );
      } else {
        summary.failed += 1;

        console.error(
          `[UPLOAD RECOVERY] Operation ${operation.id} cleanup incomplete:`,
          result.errors,
        );
      }
    } catch (error) {
      summary.failed += 1;

      console.error(
        `[UPLOAD RECOVERY] Unexpected recovery failure for operation ${operation.id}:`,
        error,
      );
    }
  }

  console.log(
    '[UPLOAD RECOVERY] Recovery run finished.',
    summary,
  );

  return summary;
}