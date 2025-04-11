import { Transaction } from '../domain/transaction.entity';
import { IRepository } from '../../../core/shared/infra/repository.interface';

export type ITransactionRepository = IRepository<Transaction> & {
  findByEventId(eventId: string): Promise<Transaction[]>;
};

export const ITransactionRepository = Symbol('ITransactionRepository');
