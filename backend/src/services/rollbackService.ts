import {
  UploadOperationType,
  UploadStatus,
} from '@prisma/client';

import { megaService } from './megaService';
import {
  getUploadOperation,
  updateUploadOperation,
} from './uploadOperationService';

export interface RollbackContext {
  operationId: string;

  /*
   * MEGA resources created during CREATE / REPLACE_AUDIO.
   */
  megaFolderNodeId?: string | null;
  megaAudioNodeId?: string | null;
  megaCoverNodeId?: string | null;

  /*
   * Existing MEGA resources that must be removed by DELETE_TRACK.
   */
  oldMegaAudioNodeId?: string | null;
  oldMegaCoverNodeId?: string | null;

  /*
   * Database resource, if applicable.
   */
  trackId?: string | null;
}

export interface RollbackResult {
  success: boolean;
  errors: string[];
}

function toErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Delete one MEGA node safely.
 *
 * megaService.deleteFile() is idempotent for a node that no longer exists,
 * so a missing node is treated as successful cleanup.
 */
async function deleteMegaNode(
  label: string,
  nodeId: string | null | undefined,
  errors: string[],
): Promise<void> {
  if (!nodeId) {
    return;
  }

  try {
    console.log(
      `[CLEANUP] Deleting ${label} node ${nodeId}`,
    );

    await megaService.deleteFile(
      nodeId,
    );

    console.log(
      `[CLEANUP] ${label} cleanup completed.`,
    );
  } catch (error) {
    const message =
      toErrorMessage(error);

    console.error(
      `[CLEANUP] Failed to delete ${label}: ${message}`,
    );

    errors.push(
      `${label} cleanup failed: ${message}`,
    );
  }
}

/**
 * Compensate MEGA resources created by CREATE / REPLACE_AUDIO.
 *
 * IMPORTANT:
 * Never delete the folder itself because getOrCreateFolder() may have
 * returned an existing shared folder.
 */
export async function rollbackMegaResources(
  context: RollbackContext,
): Promise<RollbackResult> {
  const errors: string[] = [];

  console.log(
    `[ROLLBACK] Starting rollback for operation ${context.operationId}`,
  );

  await deleteMegaNode(
    'audio',
    context.megaAudioNodeId,
    errors,
  );

  await deleteMegaNode(
    'cover',
    context.megaCoverNodeId,
    errors,
  );

  if (context.megaFolderNodeId) {
    console.log(
      `[ROLLBACK] Preserving MEGA folder ${context.megaFolderNodeId}.`,
    );
  }

  const result: RollbackResult = {
    success:
      errors.length === 0,
    errors,
  };

  console.log(
    `[ROLLBACK] Finished for operation ${context.operationId}: ${
      result.success
        ? 'SUCCESS'
        : 'FAILED'
    }`,
  );

  return result;
}

/**
 * Clean up the OLD MEGA resources belonging to a DELETE_TRACK operation.
 *
 * The database Track is already deleted when this function runs.
 *
 * Therefore:
 *   oldMegaAudioNodeId -> delete
 *   oldMegaCoverNodeId -> delete
 *
 * We intentionally do not use megaAudioNodeId / megaCoverNodeId here,
 * because those fields represent resources created by CREATE /
 * REPLACE_AUDIO operations.
 */
export async function cleanupDeletedTrackResources(
  context: RollbackContext,
): Promise<RollbackResult> {
  const errors: string[] = [];

  console.log(
    `[DELETE TRACK CLEANUP] Starting cleanup for operation ${context.operationId}`,
  );

  await deleteMegaNode(
    'old audio',
    context.oldMegaAudioNodeId,
    errors,
  );

  await deleteMegaNode(
    'old cover',
    context.oldMegaCoverNodeId,
    errors,
  );

  /*
   * The MEGA track folder is intentionally preserved.
   *
   * The application uses:
   *
   * Music/
   *   track_<trackId>/
   *
   * and deleting the folder itself could be unsafe if additional
   * resources are later stored there.
   */
  if (context.megaFolderNodeId) {
    console.log(
      `[DELETE TRACK CLEANUP] Preserving MEGA folder ${context.megaFolderNodeId}.`,
    );
  }

  const result: RollbackResult = {
    success:
      errors.length === 0,
    errors,
  };

  console.log(
    `[DELETE TRACK CLEANUP] Finished for operation ${context.operationId}: ${
      result.success
        ? 'SUCCESS'
        : 'FAILED'
    }`,
  );

  return result;
}

/**
 * Roll back a CREATE / REPLACE_AUDIO operation.
 *
 * This removes ONLY resources created by that operation.
 */
export async function rollbackUploadOperation(
  operationId: string,
  reason?: unknown,
  fallbackContext?: Partial<RollbackContext>,
): Promise<RollbackResult> {
  const operation =
    await getUploadOperation(
      operationId,
    );

  if (!operation) {
    throw new Error(
      `Upload operation '${operationId}' was not found.`,
    );
  }

  /*
   * DELETE_TRACK must not enter this function.
   */
  if (
    operation.type ===
    UploadOperationType.DELETE_TRACK
  ) {
    throw new Error(
      `Operation '${operationId}' is DELETE_TRACK. Use cleanupDeletedTrackOperation().`,
    );
  }

  const reasonMessage =
    reason === undefined ||
    reason === null
      ? null
      : toErrorMessage(reason);

  /*
   * Preserve failure reason on the operation.
   *
   * Cleanup continues even if this database update fails.
   */
  try {
    await updateUploadOperation(
      operationId,
      {
        status:
          UploadStatus.ROLLING_BACK,

        error:
          reasonMessage,
      },
    );
  } catch (error) {
    console.warn(
      '[UPLOAD OPERATION] Could not mark operation as ROLLING_BACK:',
      error,
    );
  }

  const result =
    await rollbackMegaResources({
      operationId,

      megaFolderNodeId:
        operation.megaFolder ??
        fallbackContext?.megaFolderNodeId ??
        null,

      megaAudioNodeId:
        operation.megaAudioNodeId ??
        fallbackContext?.megaAudioNodeId ??
        null,

      megaCoverNodeId:
        operation.megaCoverNodeId ??
        fallbackContext?.megaCoverNodeId ??
        null,

      trackId:
        operation.trackId ??
        fallbackContext?.trackId ??
        null,
    });

  const finalError = [
    reasonMessage,
    ...result.errors,
  ]
    .filter(Boolean)
    .join('\n');

  /*
   * ROLLED_BACK means all known resources were compensated.
   *
   * FAILED means at least one cleanup failed and needs attention.
   */
  try {
    await updateUploadOperation(
      operationId,
      {
        status:
          result.success
            ? UploadStatus.ROLLED_BACK
            : UploadStatus.FAILED,

        error:
          finalError || null,
      },
    );
  } catch (error) {
    console.error(
      '[UPLOAD OPERATION] Could not persist final rollback state:',
      error,
    );
  }

  return result;
}

/**
 * Finish cleanup for a DELETE_TRACK operation.
 *
 * This is separate from rollbackUploadOperation() because deletion has
 * already been committed to PostgreSQL. We therefore mark COMPLETED when
 * MEGA cleanup succeeds.
 *
 * When cleanup fails, the operation remains ROLLING_BACK so startup
 * recovery can retry it later.
 */
export async function cleanupDeletedTrackOperation(
  operationId: string,
  reason?: unknown,
  fallbackContext?: Partial<RollbackContext>,
): Promise<RollbackResult> {
  const operation =
    await getUploadOperation(
      operationId,
    );

  if (!operation) {
    throw new Error(
      `Upload operation '${operationId}' was not found.`,
    );
  }

  if (
    operation.type !==
    UploadOperationType.DELETE_TRACK
  ) {
    throw new Error(
      `Operation '${operationId}' is not DELETE_TRACK.`,
    );
  }

  const reasonMessage =
    reason === undefined ||
    reason === null
      ? null
      : toErrorMessage(reason);

  /*
   * Mark external cleanup as in progress.
   *
   * ROLLING_BACK is used here as the existing recovery-safe
   * "cleanup in progress" state.
   */
  try {
    await updateUploadOperation(
      operationId,
      {
        status:
          UploadStatus.ROLLING_BACK,

        error:
          reasonMessage,
      },
    );
  } catch (error) {
    console.warn(
      '[DELETE TRACK] Could not mark operation as ROLLING_BACK:',
      error,
    );
  }

  const result =
    await cleanupDeletedTrackResources({
      operationId,

      megaFolderNodeId:
        operation.megaFolder ??
        fallbackContext?.megaFolderNodeId ??
        null,

      oldMegaAudioNodeId:
        operation.oldMegaAudioNodeId ??
        fallbackContext?.oldMegaAudioNodeId ??
        null,

      oldMegaCoverNodeId:
        operation.oldMegaCoverNodeId ??
        fallbackContext?.oldMegaCoverNodeId ??
        null,

      trackId:
        operation.trackId ??
        fallbackContext?.trackId ??
        null,
    });

  /*
   * Successful external cleanup means the delete operation is completely
   * finished.
   */
  if (result.success) {
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.COMPLETED,

          error:
            null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE TRACK] Could not persist COMPLETED state:',
        error,
      );
    }
  } else {
    /*
     * Keep ROLLING_BACK so startup recovery will retry the external
     * cleanup instead of treating the operation as permanently failed.
     */
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.ROLLING_BACK,

          error: [
            reasonMessage,
            ...result.errors,
          ]
            .filter(Boolean)
            .join('\n') || null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE TRACK] Could not persist retryable cleanup state:',
        error,
      );
    }
  }

  return result;
}


/**
 * Finish cleanup for a DELETE_AUDIO operation.
 *
 * The MusicFile row has already been deleted from PostgreSQL.
 * The old MEGA audio is therefore cleaned up here.
 */
export async function cleanupDeletedAudioOperation(
  operationId: string,
  reason?: unknown,
  fallbackContext?: Partial<RollbackContext>,
): Promise<RollbackResult> {
  const operation =
    await getUploadOperation(
      operationId,
    );

  if (!operation) {
    throw new Error(
      `Upload operation '${operationId}' was not found.`,
    );
  }

  if (
    operation.type !==
    UploadOperationType.DELETE_AUDIO
  ) {
    throw new Error(
      `Operation '${operationId}' is not DELETE_AUDIO.`,
    );
  }

  const reasonMessage =
    reason === undefined ||
    reason === null
      ? null
      : toErrorMessage(reason);

  try {
    await updateUploadOperation(
      operationId,
      {
        status:
          UploadStatus.ROLLING_BACK,

        error:
          reasonMessage,
      },
    );
  } catch (error) {
    console.warn(
      '[DELETE AUDIO] Could not mark operation as ROLLING_BACK:',
      error,
    );
  }

  const errors: string[] = [];

  await deleteMegaNode(
    'old audio',
    operation.oldMegaAudioNodeId ??
      fallbackContext?.oldMegaAudioNodeId ??
      null,
    errors,
  );

  const result: RollbackResult = {
    success:
      errors.length === 0,
    errors,
  };

  if (result.success) {
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.COMPLETED,

          error:
            null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE AUDIO] Could not persist COMPLETED state:',
        error,
      );
    }
  } else {
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.ROLLING_BACK,

          error:
            [
              reasonMessage,
              ...result.errors,
            ]
              .filter(Boolean)
              .join('\n') ||
            null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE AUDIO] Could not persist retryable cleanup state:',
        error,
      );
    }
  }

  return result;
}

/**
 * Finish cleanup for a DELETE_COVER operation.
 *
 * The Track artwork reference has already been cleared from PostgreSQL.
 * The old MEGA cover is cleaned up here.
 */
export async function cleanupDeletedCoverOperation(
  operationId: string,
  reason?: unknown,
  fallbackContext?: Partial<RollbackContext>,
): Promise<RollbackResult> {
  const operation =
    await getUploadOperation(
      operationId,
    );

  if (!operation) {
    throw new Error(
      `Upload operation '${operationId}' was not found.`,
    );
  }

  if (
    operation.type !==
    UploadOperationType.DELETE_COVER
  ) {
    throw new Error(
      `Operation '${operationId}' is not DELETE_COVER.`,
    );
  }

  const reasonMessage =
    reason === undefined ||
    reason === null
      ? null
      : toErrorMessage(reason);

  try {
    await updateUploadOperation(
      operationId,
      {
        status:
          UploadStatus.ROLLING_BACK,

        error:
          reasonMessage,
      },
    );
  } catch (error) {
    console.warn(
      '[DELETE COVER] Could not mark operation as ROLLING_BACK:',
      error,
    );
  }

  const errors: string[] = [];

  await deleteMegaNode(
    'old cover',
    operation.oldMegaCoverNodeId ??
      fallbackContext?.oldMegaCoverNodeId ??
      null,
    errors,
  );

  const result: RollbackResult = {
    success:
      errors.length === 0,
    errors,
  };

  if (result.success) {
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.COMPLETED,

          error:
            null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE COVER] Could not persist COMPLETED state:',
        error,
      );
    }
  } else {
    try {
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.ROLLING_BACK,

          error:
            [
              reasonMessage,
              ...result.errors,
            ]
              .filter(Boolean)
              .join('\n') ||
            null,
        },
      );
    } catch (error) {
      console.error(
        '[DELETE COVER] Could not persist retryable cleanup state:',
        error,
      );
    }
  }

  return result;
}