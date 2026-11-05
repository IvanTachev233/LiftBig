import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Forbidden } from '../../common/forbidden.decorator';
import { INT4_MAX } from '../../common/int4';
import { MAX_WEIGHT_KG } from '../../lifts/dto/lift.dto';

// One planned set. Results belong to the client and are rejected here.
export class CoachSetInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Existing set id of this workout; omit for a new set',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: INT4_MAX })
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  reps: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: MAX_WEIGHT_KG,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT_KG)
  weight?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: INT4_MAX,
    description: 'Set number inside the card; defaults to its position',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  order?: number;

  @Forbidden()
  made?: never;

  @Forbidden()
  actualReps?: never;

  @Forbidden()
  actualWeight?: never;
}

// One planned exercise card.
export class CoachCardInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Existing card id of this workout; omit for a new card',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exerciseId: string;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: INT4_MAX,
    description: 'Card position',
  })
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  order: number;

  // Cards sharing the same value form one superset.
  @ApiPropertyOptional({ format: 'uuid', type: 'string', nullable: true })
  @IsOptional()
  @IsUUID()
  supersetGroup?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Note for the athlete; absent keeps it, null or blank clears it',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ type: () => [CoachSetInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachSetInput)
  sets: CoachSetInput[];
}

// Coach assigns a planned workout to a client.
export class CreateCoachWorkoutDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: () => [CoachCardInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachCardInput)
  exercises: CoachCardInput[];

  @Forbidden()
  status?: never;
}

// Coach edits the plan. When `exercises` is present, cards and sets are
// updated in place by id and rows left out are deleted.
export class UpdateCoachWorkoutDto {
  // Absent = unchanged; null is rejected, since these columns are required
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

  @ApiPropertyOptional({ format: 'date' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ type: () => [CoachCardInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachCardInput)
  exercises?: CoachCardInput[];

  @Forbidden()
  status?: never;
}
