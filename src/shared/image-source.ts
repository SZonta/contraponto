/** URL served by the cp-file protocol in the main process (images only). */
export function localImageUrl(file: string): string {
  return `cp-file:///${file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Agents show images by citing them in markdown: an absolute Windows path, a file:// URL or a
 * path relative to the project. All of them become cp-file URLs; web and data URLs stay as they are.
 */
export function imageSource(src: string, projectPath: string): string {
  const value = src.trim();
  if (/^(https?|data|cp-file):/i.test(value)) return value;
  if (/^file:\/\//i.test(value)) return localImageUrl(decodeURIComponent(value.replace(/^file:\/\/\/?/i, '')));
  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\')) return localImageUrl(value);
  const relative = value.replace(/^\.?[\\/]/, '');
  return localImageUrl(`${projectPath.replace(/[\\/]+$/, '')}/${relative}`);
}
