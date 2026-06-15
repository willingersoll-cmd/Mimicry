const RED_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** True for the common 1x1 red PNG and other tiny non-screenshot placeholders. */
export function isPlaceholderScreenshot(data: string): boolean {
  const trimmed = data.trim();
  if (!trimmed) return true;

  const match = trimmed.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  const base64 = (match ? match[1] : trimmed).trim();
  if (!base64) return true;
  if (base64 === RED_1X1_PNG_BASE64) return true;

  try {
    const buf = Buffer.from(base64, 'base64');
    return buf.length < 200;
  } catch {
    return true;
  }
}

export function isPlaceholderScreenshotBuffer(buffer: Buffer): boolean {
  if (buffer.length < 200) return true;
  return buffer.toString('base64') === RED_1X1_PNG_BASE64;
}
