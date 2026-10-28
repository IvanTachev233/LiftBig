import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import type { Repository } from 'typeorm';
import type { JwtPayload } from './auth-user.interface';
import { JwtStrategy } from './jwt.strategy';
import type { User } from './user.entity';

jest.mock('@sentry/nestjs', () => ({ setUser: jest.fn() }));

const payload: JwtPayload = {
  sub: 'b6f7c1de-0000-4000-8000-000000000001',
  email: 'a@b.co',
  name: 'Lifter',
  role: 'CLIENT' as User['role'],
  coachId: null,
  ver: 2,
};

describe('JwtStrategy', () => {
  const findOne = jest.fn();
  const strategy = new JwtStrategy(
    new ConfigService({ JWT_SECRET: 'unit-test-secret' }),
    { findOne } as unknown as Repository<User>,
  );

  afterEach(() => jest.clearAllMocks());

  it('tags error reports for the request with the account id only', async () => {
    findOne.mockResolvedValue({ id: payload.sub, tokenVersion: 2 });

    await strategy.validate(payload);

    expect(Sentry.setUser).toHaveBeenCalledTimes(1);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: payload.sub });
  });

  it('sets no user for a revoked token', async () => {
    findOne.mockResolvedValue({ id: payload.sub, tokenVersion: 3 });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(Sentry.setUser).not.toHaveBeenCalled();
  });
});
