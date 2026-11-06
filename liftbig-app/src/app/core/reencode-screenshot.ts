const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;
const UNREADABLE_MESSAGE = "Couldn't add that image";

/**
 * Re-encodes a picked screenshot as JPEG before upload: the longest side is
 * scaled down to at most 1600 px (never upscaled), and re-drawing on a
 * canvas drops the original's metadata (location, camera). Rejects with
 * "Couldn't add that image" when the file can't be decoded as an image.
 */
export async function reencodeScreenshot(file: File | Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(UNREADABLE_MESSAGE);
  }

  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(UNREADABLE_MESSAGE);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error(UNREADABLE_MESSAGE);
    return blob;
  } finally {
    bitmap.close();
  }
}
