import { describe, expect, it } from 'vitest';
import { CHAT_TITLE_LIMIT, normalizeChatTitle } from './chat-title';

describe('generated chat titles', () => {
  it('accepts a complete title at the 60-character limit without changing it', () => {
    const title = 'a'.repeat(CHAT_TITLE_LIMIT);
    expect(normalizeChatTitle(title)).toBe(title);
  });
  it('rejects oversized output instead of clipping it', () => {
    expect(normalizeChatTitle('a'.repeat(CHAT_TITLE_LIMIT + 1))).toBeNull();
  });
  it.each(['Resumo incompleto...', 'Resumo incompleto…', '', ' \n ', null, 42])('rejects an incomplete or missing title: %s', (title) => {
    expect(normalizeChatTitle(title)).toBeNull();
  });
  it('normalizes spacing and surrounding quotes without removing meaningful words', () => {
    expect(normalizeChatTitle('  "Teste de comandos\n e segundo plano"  ')).toBe('Teste de comandos e segundo plano');
  });
  it('counts Unicode characters without splitting them', () => {
    expect(normalizeChatTitle('😀'.repeat(60))).toBe('😀'.repeat(60));
    expect(normalizeChatTitle('😀'.repeat(61))).toBeNull();
  });
});
