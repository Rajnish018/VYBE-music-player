import { Storage } from 'megajs';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface MegaFileMetadata {
  name: string;
  size: number;
  mimeType: string;
}

export class MegaService {
  private storage: any = null;
  private connectionPromise: Promise<void> | null = null;

  isConfigured(): boolean {
    return Boolean(
      process.env.MEGA_EMAIL?.trim() &&
      process.env.MEGA_PASSWORD?.trim(),
    );
  }

  isConnected(): boolean {
    return Boolean(this.storage);
  }

  getNodeId(node: any): string {
    const nodeId =
      node?.nodeId ||
      node?.id ||
      node?.handle;

    if (!nodeId) {
      throw new Error(
        'MEGA node ID is missing from storage response.',
      );
    }

    return nodeId;
  }

  async connect(): Promise<void> {
    if (this.storage) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise =
      new Promise<void>((resolve, reject) => {
        const email =
          process.env.MEGA_EMAIL?.trim();

        const password =
          process.env.MEGA_PASSWORD?.trim();

        if (!email || !password) {
          this.connectionPromise = null;

          return reject(
            new Error(
              'MEGA_EMAIL and MEGA_PASSWORD environment variables are required.',
            ),
          );
        }

        console.log(
          '[MEGA] Connecting to MEGA Cloud Storage...',
        );

        const storageInstance =
          new Storage({
            email,
            password,
            keepalive: true,
          });

        storageInstance.ready
          .then(() => {
            this.storage =
              storageInstance;

            console.log(
              '[MEGA] Successfully connected!',
            );

            resolve();
          })
          .catch((error: any) => {
            console.error(
              '[MEGA] Connection failed:',
              error,
            );

            this.connectionPromise = null;

            reject(error);
          });
      });

    return this.connectionPromise;
  }

  private async ensureConnected(): Promise<any> {
    await this.connect();

    return this.storage;
  }

  async getOrCreateFolder(
    folderName: string,
    parentDir?: any,
  ): Promise<any> {
    const storage =
      await this.ensureConnected();

    const currentParent =
      parentDir || storage.root;

    if (currentParent.children) {
      const existing =
        currentParent.children.find(
          (child: any) =>
            child.name === folderName &&
            child.directory,
        );

      if (existing) {
        return existing;
      }
    }

    console.log(
      `[MEGA] Creating folder: ${folderName}`,
    );

    return currentParent.mkdir(
      folderName,
    );
  }

  async getFolder(
    folderName: string,
    parentDir?: any,
  ): Promise<any | null> {
    const storage =
      await this.ensureConnected();

    const currentParent =
      parentDir || storage.root;

    return (
      currentParent.children?.find(
        (child: any) =>
          child.name === folderName &&
          child.directory,
      ) || null
    );
  }

  /**
   * Upload a local file to MEGA.
   */
  async uploadFile(
    localPath: string,
    folderNodeId: string,
    targetFileName?: string,
  ): Promise<any> {
    const storage =
      await this.ensureConnected();

    const folder =
      storage.files[folderNodeId];

    if (
      !folder ||
      !folder.directory
    ) {
      throw new Error(
        `Target folder with node ID ${folderNodeId} not found in MEGA`,
      );
    }

    if (!fs.existsSync(localPath)) {
      throw new Error(
        `File does not exist: ${localPath}`,
      );
    }

    const stats =
      fs.statSync(localPath);

    const fileName =
      targetFileName ||
      path.basename(localPath);

    const fileStream =
      fs.createReadStream(localPath);

    console.log(
      `[MEGA] Uploading '${fileName}' (${stats.size} bytes)`,
    );

    const upload =
      folder.upload(
        {
          name: fileName,
          size: stats.size,
        },
        fileStream,
      );

    const uploadedFile =
      await upload.complete;

    console.log(
      `[MEGA] Uploaded '${fileName}' successfully.`,
    );

    return uploadedFile;
  }

  /**
   * Upload artwork.
   *
   * The Buffer is first written to a temporary file.
   * Then the same proven uploadFile() implementation
   * is used.
   */
  async uploadCoverFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folderNodeId: string,
  ): Promise<any> {
    if (!buffer || buffer.length === 0) {
      throw new Error(
        'Cover artwork buffer is empty.',
      );
    }

    const extension =
      path.extname(fileName) ||
      '.jpg';

    const safeFileName =
      `cover${extension}`;

    const tempDir =
      path.join(
        os.tmpdir(),
        'aura-covers',
      );

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(
        tempDir,
        {
          recursive: true,
        },
      );
    }

    const tempPath =
      path.join(
        tempDir,
        `cover-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${extension}`,
      );

    try {
      console.log(
        `[MEGA] Preparing artwork: ${safeFileName}`,
      );

      fs.writeFileSync(
        tempPath,
        buffer,
      );

      const uploaded =
        await this.uploadFile(
          tempPath,
          folderNodeId,
          safeFileName,
        );

      /*
       * Keep MIME type available to callers.
       */
      uploaded.mimeType =
        mimeType;

      console.log(
        `[MEGA] Artwork saved as ${safeFileName}`,
      );

      return uploaded;
    } finally {
      try {
        if (
          fs.existsSync(tempPath)
        ) {
          fs.unlinkSync(tempPath);
        }
      } catch (error) {
        console.warn(
          '[MEGA] Could not remove temporary artwork file:',
          error,
        );
      }
    }
  }

  /**
   * Upload a Buffer directly to MEGA.
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folderNodeId: string,
  ): Promise<any> {
    if (
      !buffer ||
      buffer.length === 0
    ) {
      throw new Error(
        `Cannot upload empty buffer for ${fileName}.`,
      );
    }

    const storage =
      await this.ensureConnected();

    const folder =
      storage.files[folderNodeId];

    if (
      !folder ||
      !folder.directory
    ) {
      throw new Error(
        `Target folder with node ID ${folderNodeId} not found in MEGA`,
      );
    }

    console.log(
      `[MEGA] Uploading '${fileName}' (${buffer.length} bytes)`,
    );

    const upload =
      folder.upload(
        {
          name: fileName,
          size: buffer.length,
        },
        buffer,
      );

    const uploadedFile =
      await upload.complete;

    uploadedFile.mimeType =
      mimeType;

    console.log(
      `[MEGA] Uploaded '${fileName}' successfully.`,
    );

    return uploadedFile;
  }

  /**
   * Download an existing MEGA file into a Buffer.
   *
   * Used for calculating SHA-256 hashes
   * of existing audio files.
   */
  async downloadFileToBuffer(
    nodeId: string,
  ): Promise<Buffer> {
    await this.ensureConnected();

    const file =
      this.getFileByNodeId(nodeId);

    if (!file) {
      throw new Error(
        `MEGA file '${nodeId}' not found.`,
      );
    }

    if (file.directory) {
      throw new Error(
        `MEGA node '${nodeId}' is a directory, not a file.`,
      );
    }

    console.log(
      `[MEGA] Downloading '${file.name}' (${nodeId}) for hash calculation...`,
    );

    if (
      typeof file.downloadBuffer !==
      'function'
    ) {
      throw new Error(
        'This megajs version does not support downloadBuffer().',
      );
    }

    const buffer =
      await file.downloadBuffer();

    if (
      !buffer ||
      buffer.length === 0
    ) {
      throw new Error(
        `MEGA file '${file.name}' returned an empty buffer.`,
      );
    }

    console.log(
      `[MEGA] Downloaded '${file.name}' (${buffer.length} bytes).`,
    );

    return Buffer.from(buffer);
  }

  /**
   * Create a public MEGA URL.
   */
  async getPublicUrl(
    node: any,
  ): Promise<string> {
    await this.ensureConnected();

    if (!node) {
      throw new Error(
        'MEGA file node is required.',
      );
    }

    if (
      typeof node.link !==
      'function'
    ) {
      throw new Error(
        'MEGA node does not support public links.',
      );
    }

    console.log(
      `[MEGA] Creating public link for '${node.name}'...`,
    );

    const link =
      await node.link();

    if (!link) {
      throw new Error(
        'MEGA did not return a public URL.',
      );
    }

    console.log(
      '[MEGA] Public link created.',
    );

    return String(link);
  }

  /**
   * Get file by node ID.
   */
  getFileByNodeId(
    nodeId: string,
  ): any {
    if (!this.storage) {
      throw new Error(
        'MEGA storage not connected. Call connect() first.',
      );
    }

    return (
      this.storage.files[nodeId] ||
      null
    );
  }

  /**
   * Delete file by node ID.
   */
  async deleteFile(
    nodeId: string,
  ): Promise<void> {
    await this.ensureConnected();

    const file =
      this.getFileByNodeId(nodeId);

    if (!file) {
      console.warn(
        `[MEGA] File '${nodeId}' not found.`,
      );

      return;
    }

    console.log(
      `[MEGA] Deleting '${file.name}' (${nodeId})...`,
    );

    await file.delete(true);

    console.log(
      `[MEGA] Deleted '${file.name}'.`,
    );
  }

  /**
   * Get file metadata.
   */
  async getFileMetadata(
    nodeId: string,
  ): Promise<MegaFileMetadata> {
    await this.ensureConnected();

    const file =
      this.getFileByNodeId(nodeId);

    if (!file) {
      throw new Error(
        `File with node ID ${nodeId} not found in MEGA`,
      );
    }

    return {
      name: file.name,
      size: file.size,
      mimeType:
        this.getMimeType(file.name),
    };
  }

  getMimeType(
    fileName: string,
  ): string {
    const extension =
      path.extname(fileName).toLowerCase();

    const mimeTypes: Record<
      string,
      string
    > = {
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.oga': 'audio/ogg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',

      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };

    return (
      mimeTypes[extension] ||
      'application/octet-stream'
    );
  }
}

export const megaService =
  new MegaService();

export const megaStorage =
  megaService;