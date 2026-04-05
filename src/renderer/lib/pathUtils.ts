/** Path utilities for renderer (no Node.js path module available) */

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return normalized.substring(0, lastSlash);
}

export function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
}

export function extname(filePath: string): string {
  const name = basename(filePath);
  const lastDot = name.lastIndexOf('.');
  return lastDot === -1 ? '' : name.substring(lastDot);
}
