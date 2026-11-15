import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Attachment } from '@shared/types';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
};

export function mimeTypeFor(file: string): string {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Attachments are copied into the app's data folder, so the project stays untouched. */
export class AttachmentStore {
  constructor(private readonly folder: string) {
    mkdirSync(folder, { recursive: true });
  }

  copy(source: string): Attachment {
    const name = path.basename(source);
    const target = path.join(this.folder, `${randomUUID()}-${name}`);
    copyFileSync(source, target);
    return { name, path: target, mimeType: mimeTypeFor(source) };
  }

  save(name: string, mimeType: string, bytes: Uint8Array): Attachment {
    const target = path.join(this.folder, `${randomUUID()}-${path.basename(name)}`);
    writeFileSync(target, bytes);
    return { name, path: target, mimeType };
  }
}
