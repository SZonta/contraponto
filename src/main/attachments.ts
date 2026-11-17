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

/** Attachments are copied into the chat's own folder in the app's data, so the project stays untouched. */
export class AttachmentStore {
  constructor(private readonly folderFor: (chatId: string) => string) {}

  copy(chatId: string, source: string): Attachment {
    const name = path.basename(source);
    const target = this.target(chatId, name);
    copyFileSync(source, target);
    return { name, path: target, mimeType: mimeTypeFor(source) };
  }

  save(chatId: string, name: string, mimeType: string, bytes: Uint8Array): Attachment {
    const target = this.target(chatId, path.basename(name));
    writeFileSync(target, bytes);
    return { name, path: target, mimeType };
  }

  private target(chatId: string, name: string): string {
    const folder = this.folderFor(chatId);
    mkdirSync(folder, { recursive: true });
    return path.join(folder, `${randomUUID()}-${name}`);
  }
}
