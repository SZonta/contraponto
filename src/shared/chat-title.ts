export const CHAT_TITLE_LIMIT = 60;

/** Generated titles must be complete, never shortened by cutting words or adding ellipses. */
export function normalizeChatTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
  return title && Array.from(title).length <= CHAT_TITLE_LIMIT && !/…|\.{3}/.test(title) ? title : null;
}
