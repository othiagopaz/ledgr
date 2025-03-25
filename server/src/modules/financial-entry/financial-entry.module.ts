import { Module } from '@nestjs/common';
import { FinancialEntryService } from './services/financial-entry.service';
import { FinancialEntryController } from './controllers/financial-entry.controller';
import { FinancialEntryRepository } from '../../infrastructure/financial-entry/financial-entry.repository';
import { FinancialEntryEntity } from '../../infrastructure/financial-entry/financial-entry.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentModule } from '../installment/installment.module';
import { FinancialEntryMapper } from '../../infrastructure/financial-entry/financial-entry.mapper';
import { CategoryModule } from '../category/category.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([FinancialEntryEntity]),
    InstallmentModule,
    CategoryModule,
  ],
  controllers: [FinancialEntryController],
  providers: [
    FinancialEntryService,
    FinancialEntryRepository,
    FinancialEntryMapper,
  ],
  exports: [FinancialEntryService],
})
export class FinancialEntryModule {}
