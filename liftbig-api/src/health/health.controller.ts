import {
  Controller,
  Get,
  Header,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

// Read by the Cloud Run startup probe, the uptime check and the pipeline smoke
// check; no auth and no data, only whether the database answers.
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      '200 {status: "ok"} when the database answers, 503 when not. No auth',
  })
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Database check failed: ${reason}`);
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
