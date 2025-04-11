import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Transaction } from '../domain/transaction.entity';
import { TransactionEntity } from './transaction.orm-entity';
import { TransactionMapper } from './transaction.mapper';
import { BaseRepository } from '../../shared/infra/base.repository';
import { ITransactionRepository } from './transaction.repository.interface';

@Injectable()
export class TransactionRepository
  extends BaseRepository<Transaction, TransactionEntity>
  implements ITransactionRepository
{
  protected repo: Repository<TransactionEntity>;

  constructor(
    @InjectRepository(TransactionEntity)
    repo: Repository<TransactionEntity>,
    mapper: TransactionMapper,
  ) {
    super(repo, mapper);
    this.repo = repo;
  }

  async findByEventId(eventId: string): Promise<Transaction[]> {
    const transactions = await this.repo.find({
      where: { eventId },
    });
    return transactions.map((transaction) => this.mapper.toDomain(transaction));
  }
}
