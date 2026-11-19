import { Repository } from 'typeorm';
import { FeatureFlag } from './feature-flag.entity';
import { FeatureFlagsService } from './feature-flags.service';

// Builds a fake repository whose createQueryBuilder().getMany() resolves
// to the given rows, as if they were the caller's feature_flag rows.
function repoWithRows(rows: Partial<FeatureFlag>[]): Repository<FeatureFlag> {
  const getMany = jest.fn().mockResolvedValue(rows);
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany,
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<FeatureFlag>;
}

describe('FeatureFlagsService', () => {
  it('returns every known flag as false when the user has no rows', async () => {
    const service = new FeatureFlagsService(repoWithRows([]));
    await expect(service.flagsFor('u1')).resolves.toEqual({ vision: false });
  });

  it('returns true for an enabled row', async () => {
    const service = new FeatureFlagsService(
      repoWithRows([{ flag: 'vision', enabled: true }]),
    );
    await expect(service.flagsFor('u1')).resolves.toEqual({ vision: true });
  });

  it('returns false for a disabled row', async () => {
    const service = new FeatureFlagsService(
      repoWithRows([{ flag: 'vision', enabled: false }]),
    );
    await expect(service.flagsFor('u1')).resolves.toEqual({ vision: false });
  });

  it('ignores a row whose flag name is not in the registry', async () => {
    const service = new FeatureFlagsService(
      repoWithRows([{ flag: 'not-a-real-flag', enabled: true }]),
    );
    await expect(service.flagsFor('u1')).resolves.toEqual({ vision: false });
  });
});
