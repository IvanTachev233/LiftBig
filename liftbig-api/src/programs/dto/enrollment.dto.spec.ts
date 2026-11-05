import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MaxInput } from './enrollment.dto';

describe('MaxInput', () => {
  const weightErrors = async (weightKg: number) =>
    (
      await validate(
        plainToInstance(MaxInput, {
          exerciseId: '00000000-0000-4000-8000-000000000000',
          weightKg,
        }),
      )
    ).map((e) => e.property);

  it('accepts 0.01 kg to 9999.99 kg', async () => {
    expect(await weightErrors(0.01)).toEqual([]);
    expect(await weightErrors(9999.99)).toEqual([]);
  });

  it('rejects maxes stored as 0 kg or past numeric(6,2)', async () => {
    for (const weightKg of [0.004, 0.009, 0, -1, 9999.991, 10000]) {
      expect(await weightErrors(weightKg)).toEqual(['weightKg']);
    }
  });
});
