import { detectImageType, extensionFor } from './magic-bytes';

describe('detectImageType', () => {
  it('detects JPEG by its first bytes', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(buffer)).toBe('image/jpeg');
  });

  it('detects PNG by its signature', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(detectImageType(buffer)).toBe('image/png');
  });

  it('detects WebP by RIFF/WEBP', () => {
    const buffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(detectImageType(buffer)).toBe('image/webp');
  });

  it('rejects a renamed text file with no image signature', () => {
    const buffer = Buffer.from('this is not an image, just text', 'utf8');
    expect(detectImageType(buffer)).toBeNull();
  });

  it('rejects a buffer too short to carry any signature', () => {
    expect(detectImageType(Buffer.from([0xff]))).toBeNull();
  });
});

describe('extensionFor', () => {
  it('maps each detected type to its extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
  });
});
