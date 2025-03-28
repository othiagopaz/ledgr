import { Module } from '@nestjs/common';
import { TransactionService } from './services/transaction.service';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionRepository } from '../../infrastructure/Transaction/transaction.repository';
import { TransactionMapper } from '../../infrastructure/Transaction/transaction.mapper';
import { TransactionEntity } from '../../infrastructure/Transaction/transaction.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TRANSACTION_REPOSITORY } from '../../infrastructure/common/repository.tokens';

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
  exports: [TransactionService],
})
export class TransactionModule {}
