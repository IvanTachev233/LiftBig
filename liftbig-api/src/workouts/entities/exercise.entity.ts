import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../auth/user.entity';
import { exerciseMediaBaseUrl, exerciseMediaUrl } from '../exercise-media';

export enum BodyPart {
  CHEST = 'CH',
  BACK = 'BK',
  LEGS = 'LG',
  SHOULDERS = 'SH',
  ARMS = 'AR',
  CORE = 'CO',
  FULL_BODY = 'FB',
  OTHER = 'OT',
}

@Entity()
// Names are unique per owner. Postgres treats null owners as distinct, so
// duplicate global names are blocked by the service's 409 check instead.
@Unique(['name', 'createdById'])
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: BodyPart,
    default: BodyPart.OTHER,
  })
  bodyPart: BodyPart;

  // Movement family shown in the exercise picker (Olympic, Squat, Press,
  // Pull); set by the seeder for global exercises, null otherwise
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  // e.g. Barbell; set by the seeder for global exercises, null otherwise
  @Column({ type: 'varchar', nullable: true })
  equipment: string | null;

  // null = global, visible to everyone. Otherwise the coach who created it,
  // visible to that coach and their clients. A coach who owns exercises
  // can't be deleted.
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  videoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  // Object keys of a global's demo video and image in the public media
  // bucket (ADR 0026), kept in step with exercises.json by the seeder. Never
  // sent: toJSON turns them into videoUrl / imageUrl.
  @Column({ type: 'varchar', nullable: true })
  videoKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageKey: string | null;

  // Whether rep maxes can be recorded for this exercise.
  @Column({ type: 'boolean', default: false })
  isMaxTrackable: boolean;

  // What the API sends (Express calls this through JSON.stringify, nested
  // exercises included): a key becomes <EXERCISE_MEDIA_BASE_URL>/<key> in
  // place of the stored URL; without the base URL a key gives no media.
  // Saving is unaffected, so the derived URL never reaches the database.
  toJSON(): Omit<Exercise, 'videoKey' | 'imageKey' | 'toJSON'> {
    const { videoKey, imageKey, ...fields } = this;
    const base = exerciseMediaBaseUrl();
    return {
      ...fields,
      videoUrl: videoKey ? exerciseMediaUrl(videoKey, base) : this.videoUrl,
      imageUrl: imageKey ? exerciseMediaUrl(imageKey, base) : this.imageUrl,
    };
  }
}
