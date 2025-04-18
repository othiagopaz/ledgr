import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementEntity } from './infra/settlement.orm-entity';
import { SettlementService } from './services/settlement.service';
import { SettlementRepository } from './infra/settlement.repository';
import { SettlementMapper } from './infra/settlement.mapper';
import { SettlementController } from './controllers/settlement.controller';
import { SETTLEMENT_REPOSITORY } from './infra/settlement.repository.interface';
import { TransactionModule } from '../Transaction/transaction.module';
@Module({
  imports: [TypeOrmModule.forFeature([SettlementEntity]), TransactionModule],
  providers: [
    SettlementService,
    {
      provide: SETTLEMENT_REPOSITORY,
      useClass: SettlementRepository,
    },
    SettlementMapper,
  ],
  controllers: [SettlementController],
  exports: [SettlementService, SETTLEMENT_REPOSITORY, SettlementMapper],
})
export class SettlementModule {}
