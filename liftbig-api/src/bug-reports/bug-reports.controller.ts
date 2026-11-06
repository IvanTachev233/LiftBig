import {
  Body,
  Controller,
  Post,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MAX_FILES, MULTER_FILE_SIZE_SAFETY_BYTES } from './bug-report-limits';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

@ApiTags('bug-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly bugReports: BugReportsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Report a bug from the app, with up to 3 screenshots',
  })
  @UseInterceptors(
    FilesInterceptor('screenshots', MAX_FILES, {
      limits: { fileSize: MULTER_FILE_SIZE_SAFETY_BYTES },
    }),
  )
  create(
    @Body() dto: CreateBugReportDto,
    @Request() req: AuthenticatedRequest,
    @UploadedFiles() screenshots?: Express.Multer.File[],
  ) {
    return this.bugReports.create(req.user, dto, screenshots ?? []);
  }
}
