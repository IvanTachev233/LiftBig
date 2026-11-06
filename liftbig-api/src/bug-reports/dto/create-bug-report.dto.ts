import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CONTEXT_FIELD_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  STEPS_MAX_LENGTH,
} from '../bug-report-limits';
import type { BugReportPlatform } from '../bug-report.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const isSent = (_: unknown, value: unknown): boolean =>
  value !== undefined && value !== '';

// multipart/form-data fields of POST /bug-reports (notes/spec.md § LB-38
// API). There is no `role` field: it is always derived server-side from the
// authenticated user (see BugReportsService), and an extra `role` sent by a
// client is dropped by the global ValidationPipe's whitelist rather than
// causing a 400.
export class CreateBugReportDto {
  @ApiProperty({
    minLength: DESCRIPTION_MIN_LENGTH,
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @Length(DESCRIPTION_MIN_LENGTH, DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiPropertyOptional({ maxLength: STEPS_MAX_LENGTH })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString()
  @MaxLength(STEPS_MAX_LENGTH)
  steps?: string;

  @ApiPropertyOptional({ maxLength: CONTEXT_FIELD_MAX_LENGTH })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString()
  @MaxLength(CONTEXT_FIELD_MAX_LENGTH)
  appVersion?: string;

  @ApiPropertyOptional()
  @ValidateIf(isSent)
  @Transform(({ value }: { value: unknown }) => {
    if (value === '') return undefined;
    return typeof value === 'string' ? parseInt(value, 10) : value;
  })
  @IsInt()
  versionCode?: number;

  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  @IsIn(['android', 'ios', 'web'])
  platform: BugReportPlatform;

  @ApiPropertyOptional({ maxLength: CONTEXT_FIELD_MAX_LENGTH })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString()
  @MaxLength(CONTEXT_FIELD_MAX_LENGTH)
  osVersion?: string;

  @ApiPropertyOptional({ maxLength: CONTEXT_FIELD_MAX_LENGTH })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString()
  @MaxLength(CONTEXT_FIELD_MAX_LENGTH)
  deviceModel?: string;
}
