import { Module } from '@nestjs/common';
import { FinancialEntryService } from './services/financial-entry.service';
import { FinancialEntryController } from './controllers/financial-entry.controller';
import { FinancialEntryRepository } from './repositories/financial-entry.repository';
// import { FinancialEntryEntity } from './entities/financial-entry.orm-entity';
// import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialEntryRepositoryMock } from './repositories/financial-entry.repository.mock';
@Module({
  // imports: [TypeOrmModule.forFeature([FinancialEntryEntity])],
  controllers: [FinancialEntryController],
  providers: [
    FinancialEntryService,
    {
      provide: FinancialEntryRepository,
      useClass: FinancialEntryRepositoryMock,
    },
  ],
  exports: [FinancialEntryService],
})
export class FinancialEntryModule {}
