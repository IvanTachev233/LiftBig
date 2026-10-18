import { newClientId } from './client-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newClientId', () => {
  it('returns a UUID v4', () => {
    expect(newClientId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues where randomUUID is missing (an insecure origin)', () => {
    const noRandomUuid = { getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a) };
    const ids = new Set(Array.from({ length: 50 }, () => newClientId(noRandomUuid)));
    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
  });
});
