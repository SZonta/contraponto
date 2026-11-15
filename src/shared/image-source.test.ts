import { describe, expect, it } from 'vitest';
import { imageSource, localImageUrl } from './image-source';

const PROJECT = 'C:\\Projetos\\fita-sem-etiqueta';

describe('imageSource', () => {
  it('serves an absolute Windows path through cp-file', () => {
    expect(imageSource('C:\\Temp\\mockup do app.png', PROJECT)).toBe('cp-file:///C%3A/Temp/mockup%20do%20app.png');
  });

  it('accepts forward slashes and file:// URLs', () => {
    expect(imageSource('C:/Temp/a.png', PROJECT)).toBe(localImageUrl('C:/Temp/a.png'));
    expect(imageSource('file:///C:/Temp/a%20b.png', PROJECT)).toBe(localImageUrl('C:/Temp/a b.png'));
  });

  it('resolves relative paths against the project folder', () => {
    expect(imageSource('assets/madeira.png', PROJECT)).toBe(localImageUrl('C:\\Projetos\\fita-sem-etiqueta/assets/madeira.png'));
    expect(imageSource('./assets/madeira.png', PROJECT)).toBe(localImageUrl('C:\\Projetos\\fita-sem-etiqueta/assets/madeira.png'));
  });

  it('keeps web, data and cp-file URLs', () => {
    expect(imageSource('https://example.com/a.png', PROJECT)).toBe('https://example.com/a.png');
    expect(imageSource('data:image/png;base64,AAA', PROJECT)).toBe('data:image/png;base64,AAA');
  });
});
