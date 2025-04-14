import { Module } from '@nestjs/common';
import { TransactionService } from './services/transaction.service';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionRepository } from './infra/transaction.repository';
import { TransactionMapper } from './infra/transaction.mapper';
import { TransactionEntity } from './infra/transaction.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TRANSACTION_REPOSITORY } from './infra/transaction.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity])],
  providers: [
    TransactionService,
    {
      provide: TRANSACTION_REPOSITORY,
      useClass: TransactionRepository,
    },
    TransactionMapper,
  ],
  controllers: [TransactionController],
  exports: [TransactionService, TRANSACTION_REPOSITORY, TransactionMapper],
})
export class TransactionModule {}
