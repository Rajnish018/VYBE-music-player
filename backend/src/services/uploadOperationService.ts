import {
  Prisma,
  UploadOperationType,
  UploadStatus,
} from '@prisma/client';

import { prisma } from '../config/db';

export interface CreateUploadOperationData {
  type?: UploadOperationType;
  megaFolder?: string | null;
  trackId?: string | null;
}

export interface UpdateUploadOperationData {
  type?: UploadOperationType;
  status?: UploadStatus;
  megaFolder?: string | null;
  megaAudioNodeId?: string | null;
  megaCoverNodeId?: string | null;
  oldMegaAudioNodeId?: string | null;
  oldMegaCoverNodeId?: string | null;
  trackId?: string | null;
  error?: string | null;
}

const activeHeartbeatTimers =
  new Map<string, NodeJS.Timeout>();

const DEFAULT_LEASE_MINUTES = 15;
const DEFAULT_HEARTBEAT_SECONDS = 30;

function getPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed =
    Number.parseInt(value ?? '', 10);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

function getLeaseMinutes(): number {
  return getPositiveInteger(
    process.env.UPLOAD_OPERATION_LEASE_MINUTES,
    DEFAULT_LEASE_MINUTES,
  );
}

function getHeartbeatSeconds(): number {
  const configured =
    getPositiveInteger(
      process.env.UPLOAD_OPERATION_HEARTBEAT_SECONDS,
      DEFAULT_HEARTBEAT_SECONDS,
    );

  /*
   * Never allow the heartbeat interval to be
   * equal to or greater than the lease.
   */
  const maximum =
    Math.max(
      1,
      Math.floor(
        (getLeaseMinutes() * 60) / 3,
      ),
    );

  return Math.min(
    configured,
    maximum,
  );
}

function getLeaseExpiry(): Date {
  return new Date(
    Date.now() +
      getLeaseMinutes() * 60 * 1000,
  );
}

function isTerminalStatus(
  status: UploadStatus | undefined,
): boolean {
  return (
    status === UploadStatus.COMPLETED ||
    status === UploadStatus.ROLLED_BACK ||
    status === UploadStatus.FAILED
  );
}

async function touchUploadOperationLease(
  operationId: string,
): Promise<void> {
  try {
    const now = new Date();

    await prisma.uploadOperation.updateMany({
      where: {
        id: operationId,
        status: {
          in: [
            UploadStatus.PENDING,
            UploadStatus.UPLOADING,
            UploadStatus.DB_COMMITTING,
            UploadStatus.ROLLING_BACK,
          ],
        },
      },
      data: {
        leaseExpiresAt:
          new Date(
            now.getTime() +
              getLeaseMinutes() *
                60 *
                1000,
          ),

        lastHeartbeatAt:
          now,
      },
    });
  } catch (error) {
    console.warn(
      `[UPLOAD OPERATION] Heartbeat failed for ${operationId}:`,
      error,
    );
  }
}

function stopUploadOperationHeartbeat(
  operationId: string,
): void {
  const timer =
    activeHeartbeatTimers.get(
      operationId,
    );

  if (!timer) {
    return;
  }

  clearInterval(timer);
  activeHeartbeatTimers.delete(
    operationId,
  );
}

function startUploadOperationHeartbeat(
  operationId: string,
): void {
  stopUploadOperationHeartbeat(
    operationId,
  );

  const intervalMs =
    getHeartbeatSeconds() * 1000;

  const timer = setInterval(() => {
    void touchUploadOperationLease(
      operationId,
    );
  }, intervalMs);

  /*
   * Do not let the heartbeat timer itself
   * keep Node.js alive during shutdown.
   */
  timer.unref?.();

  activeHeartbeatTimers.set(
    operationId,
    timer,
  );
}

export async function createUploadOperation(
  data: CreateUploadOperationData = {},
) {
  try {
    const now = new Date();

    const operation =
      await prisma.uploadOperation.create({
        data: {
          type:
            data.type ??
            UploadOperationType.CREATE,

          status:
            UploadStatus.PENDING,

          megaFolder:
            data.megaFolder ?? null,

          trackId:
            data.trackId ?? null,

          leaseExpiresAt:
            new Date(
              now.getTime() +
                getLeaseMinutes() *
                  60 *
                  1000,
            ),

          lastHeartbeatAt:
            now,
        },
      });

    startUploadOperationHeartbeat(
      operation.id,
    );

    return operation;
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new Error(
        'TRACK_OPERATION_IN_PROGRESS',
      );
    }

    throw error;
  }
}

export async function updateUploadOperation(
  operationId: string,
  data: UpdateUploadOperationData,
) {
  const terminal =
    isTerminalStatus(
      data.status,
    );

  const operation =
    await prisma.uploadOperation.update({
      where: {
        id: operationId,
      },
      data: {
        ...data,

        ...(terminal
          ? {
              leaseExpiresAt:
                null,
              lastHeartbeatAt:
                null,
            }
          : {
              leaseExpiresAt:
                getLeaseExpiry(),
              lastHeartbeatAt:
                new Date(),
            }),
      },
    });

  if (terminal) {
    stopUploadOperationHeartbeat(
      operationId,
    );
  } else {
    startUploadOperationHeartbeat(
      operationId,
    );
  }

  return operation;
}

export async function getUploadOperation(
  operationId: string,
) {
  return prisma.uploadOperation.findUnique({
    where: {
      id: operationId,
    },
  });
}

export async function markUploadOperationFailed(
  operationId: string,
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return updateUploadOperation(
    operationId,
    {
      status:
        UploadStatus.FAILED,
      error: message,
    },
  );
}