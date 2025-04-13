import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ISettlementRepository } from './infra/settlement.repository.interface';
import { SettlementEntity } from './infra/settlement.orm-entity';
import { SettlementService } from './services/settlement.service';
import { SettlementRepository } from './infra/settlement.repository';
import { SettlementMapper } from './infra/settlement.mapper';
import { SettlementController } from './controllers/settlement.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementEntity])],
  providers: [
    SettlementService,
    {
      provide: ISettlementRepository,
      useClass: SettlementRepository,
    },
    SettlementMapper,
  ],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
