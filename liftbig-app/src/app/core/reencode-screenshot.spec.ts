import { reencodeScreenshot } from './reencode-screenshot';

/** A plain-colour PNG of the given size, as a picked file would arrive */
async function canvasFile(width: number, height: number): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  );
  return new File([blob], 'shot.png', { type: 'image/png' });
}

describe('reencodeScreenshot', () => {
  it('re-encodes as JPEG, scaling the longest side down to 1600 px', async () => {
    const file = await canvasFile(2000, 1000);
    const result = await reencodeScreenshot(file);

    expect(result.type).toBe('image/jpeg');
    const bitmap = await createImageBitmap(result);
    expect(bitmap.width).toBe(1600);
    expect(bitmap.height).toBe(800);
    bitmap.close();
  });

  it("doesn't upscale an image already under the limit", async () => {
    const file = await canvasFile(200, 100);
    const result = await reencodeScreenshot(file);

    const bitmap = await createImageBitmap(result);
    expect(bitmap.width).toBe(200);
    expect(bitmap.height).toBe(100);
    bitmap.close();
  });

  it("rejects an image that can't be read", async () => {
    const file = new File(['not an image'], 'broken.png', { type: 'image/png' });
    await expectAsync(reencodeScreenshot(file)).toBeRejectedWithError("Couldn't add that image");
  });
});
