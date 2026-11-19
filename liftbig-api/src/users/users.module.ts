import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/user.entity';
import { BugReportStorageModule } from '../bug-reports/storage/bug-report-storage.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PoliciesModule } from '../policies/policies.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuthModule,
    PoliciesModule,
    FeatureFlagsModule,
    BugReportStorageModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
