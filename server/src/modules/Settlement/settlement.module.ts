import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementController } from './controllers/settlement.controller';
import { SettlementService } from './services/settlement.service';
import { SettlementOrmEntity } from './infra/settlement.orm-entity';
import { SettlementRepository } from './infra/settlement.repository';
import { SettlementMapper } from './infra/settlement.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([SettlementOrmEntity])],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementRepository, SettlementMapper],
  exports: [SettlementService],
})
export class SettlementModule {}
