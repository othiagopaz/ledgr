import { Transaction } from '../../domain/Transaction/transaction.entity';
import { IRepository } from '../common/repository.interface';

export type ITransactionRepository = IRepository<Transaction> & {
  findByEventId(eventId: string): Promise<Transaction[]>;
};

export const ITransactionRepository = Symbol('ITransactionRepository');
