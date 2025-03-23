import { Module } from '@nestjs/common';
import { FinancialEntryService } from './services/financial-entry.service';
import { FinancialEntryController } from './controllers/financial-entry.controller';
import { FinancialEntryRepository } from './repositories/financial-entry.repository';
import { FinancialEntryEntity } from './entities/financial-entry.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentModule } from '@/modules/installment/installment.module';
import { FinancialEntryMapper } from './mappers/financial-entry.mapper';
import { CategoryModule } from '@/modules/category/category.module';
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
