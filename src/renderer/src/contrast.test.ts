import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const colors = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})/gi)].map((match) => [match[1], match[2]]));
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
function ratio(first: string, second: string): number {
  const values = [luminance(colors[first]), luminance(colors[second])].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe('actual interface palette', () => {
  it.each([['text', 'ink'], ['text', 'panel'], ['muted', 'panel'], ['muted', 'raised'], ['claude', 'raised'], ['codex', 'panel'], ['ink', 'codex']])
   ('keeps small text %s on %s above AA contrast', (foreground, background) => expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5));
  it.each([['control', 'panel'], ['control', 'ink'], ['codex', 'raised']])
   ('keeps control/focus %s against %s above 3:1', (foreground, background) => expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3));
});
