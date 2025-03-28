import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Transaction } from '../../../domain/Transaction/transaction.entity';
import { ITransactionRepository } from '../../../infrastructure/Transaction/transaction.repository.interface';
import { Event } from '../../../domain/Event/event.entity';
import { UpdateTransactionDto } from '../dtos/update-transaction.dto';
import { CreateTransactionDto } from '../dtos/create-transaction.dto';
import { TRANSACTION_REPOSITORY } from '../../../infrastructure/common/repository.tokens';

@Injectable()
export class TransactionService {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly repo: ITransactionRepository,
  ) {}

  async create(dto: CreateTransactionDto): Promise<Transaction> {
    const entry = Transaction.create({
      eventId: dto.eventId,
      amount: dto.amount,
      dueDate: dto.dueDate,
      competenceDate: dto.competenceDate,
      status: dto.status,
      paymentDate: dto.paymentDate,
      accountId: dto.accountId,
      creditCardId: dto.creditCardId,
      isRefundable: dto.isRefundable,
      isShared: dto.isShared,
      notes: dto.notes,
    });

    await this.repo.save(entry);
    return entry;
  }

  findAll(): Promise<Transaction[]> {
    return this.repo.findAll();
  }

  async findById(id: string): Promise<Transaction> {
    const entry = await this.repo.findById(id);
    if (!entry) {
      throw new NotFoundException('Transaction not found');
    }
    return entry;
  }

  findByEventId(eventId: string): Promise<Transaction[] | null> {
    return this.repo.findWithFilters({ eventId });
  }

  async update(id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const transaction = await this.findById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const updatedTransaction = new Transaction(
      transaction.id,
      dto.eventId ?? transaction.eventId,
      dto.amount ?? transaction.amount,
      dto.dueDate ? new Date(dto.dueDate) : transaction.dueDate,
      dto.competenceDate
        ? new Date(dto.competenceDate)
        : transaction.competenceDate,
      dto.status ?? transaction.status,
      dto.paymentDate ? new Date(dto.paymentDate) : transaction.paymentDate,
      dto.accountId ?? transaction.accountId,
      dto.creditCardId ?? transaction.creditCardId,
      dto.isRefundable ?? transaction.isRefundable,
      dto.isShared ?? transaction.isShared,
      dto.notes ?? transaction.notes,
    );

    return this.repo.save(updatedTransaction);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async createFromEntry(entry: Event) {
    const transactions = entry.generateTransactions();
    await this.repo.saveMany(transactions);
    return transactions;
  }
}
