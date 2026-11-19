import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from './feature-flag.entity';
import { FlagsPayload, KNOWN_FLAGS } from './feature-flags';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flags: Repository<FeatureFlag>,
  ) {}

  /**
   * Every known flag as a boolean for this user. No row, a row with
   * enabled=false, or a row for another user all count as false; a row
   * whose flag name is not in KNOWN_FLAGS is ignored.
   */
  async flagsFor(userId: string): Promise<FlagsPayload> {
    const rows = await this.flags
      .createQueryBuilder('flag')
      .select(['flag.flag', 'flag.enabled'])
      .where('flag.userId = :userId', { userId })
      .getMany();
    const enabled = new Set(
      rows.filter((row) => row.enabled).map((row) => row.flag),
    );
    return Object.fromEntries(
      KNOWN_FLAGS.map((name) => [name, enabled.has(name)]),
    ) as FlagsPayload;
  }
}
