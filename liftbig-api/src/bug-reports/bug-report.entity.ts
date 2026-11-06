import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';

export type BugReportPlatform = 'android' | 'ios' | 'web';
export type GithubIssueStatus = 'pending' | 'created' | 'failed' | 'disabled';

// A tester's bug report (LB-38; see notes/spec.md § LB-38 Stored data).
// Screenshots live in Cloud Storage, named by screenshotNames; the GitHub
// issue carries no identity, so this row is the only link between a report
// and the account that sent it. Deleting the account deletes this row and
// asks the storage transport to delete the screenshots (account-deletion.ts).
@Entity('bug_report')
@Index(['userId', 'createdAt'])
export class BugReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  steps: string | null;

  // Context fields are optional strings/ints up to 100 characters; the app
  // always sends them, but nothing requires it.
  @Column({ type: 'varchar', nullable: true })
  appVersion: string | null;

  @Column({ type: 'int', nullable: true })
  versionCode: number | null;

  @Column({ type: 'varchar' })
  platform: BugReportPlatform;

  @Column({ type: 'varchar', nullable: true })
  osVersion: string | null;

  @Column({ type: 'varchar', nullable: true })
  deviceModel: string | null;

  // Derived from the authenticated user at submit time, never from the
  // client (CreateBugReportDto has no role field, so a sent one is
  // stripped by the global ValidationPipe's whitelist).
  @Column({ type: 'varchar' })
  role: string;

  // Object names in the storage bucket ("<reportId>/<n>.<ext>"); null or
  // empty when there were no screenshots, or no bucket is configured.
  @Column({ type: 'simple-array', nullable: true })
  screenshotNames: string[] | null;

  @Column({ type: 'int', nullable: true })
  githubIssueNumber: number | null;

  @Column({ type: 'varchar', default: 'pending' })
  githubStatus: GithubIssueStatus;

  @Column({ type: 'timestamp' })
  createdAt: Date;
}
