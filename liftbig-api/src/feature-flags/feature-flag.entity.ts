import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../auth/user.entity';

// A feature flag switched on (or off) for one user (L3a; see notes/spec.md
// § Tier 3 Vision pilot › Who can use it). No row for a (userId, flag) pair
// means off; a row with enabled=false also means off. Only flag names in
// KNOWN_FLAGS (feature-flags.ts) are returned by FeatureFlagsService.
@Entity('feature_flag')
@Unique(['userId', 'flag'])
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar' })
  flag: string;

  @Column({ type: 'boolean' })
  enabled: boolean;

  @Column({ type: 'timestamp' })
  createdAt: Date;
}
