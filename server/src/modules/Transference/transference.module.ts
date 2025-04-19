import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferenceEntity } from './infra/transference.orm-entity';
import { TransferenceRepository } from './infra/transference.repository';
import { TransferenceMapper } from './infra/transference.mapper';
import { TRANSFERENCE_REPOSITORY } from './infra/transference.repository.interface';
import { AccountModule } from '../Account/account.module';
import { EventModule } from '../Event/event.module';
import { TransferenceController } from './controllers/transference.controller';
import { TransferenceService } from './services/transference.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferenceEntity]),
    forwardRef(() => AccountModule),
    forwardRef(() => EventModule),
  ],
  providers: [
    TransferenceMapper,
    {
      provide: TRANSFERENCE_REPOSITORY,
      useClass: TransferenceRepository,
    },
  ],
  exports: [TRANSFERENCE_REPOSITORY, TransferenceMapper, TransferenceService],
  controllers: [TransferenceController],
})
export class TransferenceModule {}
