import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInviteDto } from './auth.dto';

describe('CreateInviteDto', () => {
  const errorsFor = async (body: object) =>
    (await validate(plainToInstance(CreateInviteDto, body))).map(
      (e) => e.property,
    );

  it('accepts an email', async () => {
    expect(await errorsFor({ email: 'client@example.com' })).toEqual([]);
  });

  it('rejects a missing email', async () => {
    expect(await errorsFor({})).toEqual(['email']);
  });

  it('rejects a value that is not an email', async () => {
    expect(await errorsFor({ email: 'not-an-email' })).toEqual(['email']);
    expect(await errorsFor({ email: 42 })).toEqual(['email']);
  });
});
