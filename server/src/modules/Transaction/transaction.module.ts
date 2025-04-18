import { Module, forwardRef } from '@nestjs/common';
import { TransactionService } from './services/transaction.service';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionRepository } from './infra/transaction.repository';
import { TransactionMapper } from './infra/transaction.mapper';
import { TransactionEntity } from './infra/transaction.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TRANSACTION_REPOSITORY } from './infra/transaction.repository.interface';
import { EventModule } from '../Event/event.module';
import { AccountModule } from '../Account/account.module';
import { InvoiceModule } from '../Invoice/invoice.module';
import { CreditCardModule } from '../CreditCard/credit-card.module';
@Module({
  imports: [
    forwardRef(() => EventModule),
    forwardRef(() => AccountModule),
    forwardRef(() => InvoiceModule),
    forwardRef(() => CreditCardModule),
    TypeOrmModule.forFeature([TransactionEntity]),
  ],
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
