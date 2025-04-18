import { Transaction } from '../domain/transaction.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

export type ITransactionRepository = IRepository<Transaction> & {
  findByEventId(eventId: string): Promise<Transaction[]>;
};

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');
