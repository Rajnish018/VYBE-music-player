import { PrismaClient, UploadStatus } from '@prisma/client';

const prisma = new PrismaClient();

const status: UploadStatus = UploadStatus.PENDING;

console.log(status);
