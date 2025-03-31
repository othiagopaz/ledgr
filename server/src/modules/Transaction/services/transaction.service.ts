import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Transaction } from '../../../domain/Transaction/transaction.entity';
import { ITransactionRepository } from '../../../infrastructure/Transaction/transaction.repository.interface';
import { UpdateTransactionDto } from '../dtos/update-transaction.dto';
import { CreateTransactionDto } from '../dtos/create-transaction.dto';
import { TRANSACTION_REPOSITORY } from '../../../infrastructure/common/repository.tokens';
import { Money } from '../../../common/types/money';
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
      ownership: dto.ownership,
      type: dto.type,
      paymentDate: dto.paymentDate,
      accountId: dto.accountId,
      creditCardId: dto.creditCardId,
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

    const updatedTransaction = Transaction.create({
      eventId: dto.eventId ?? transaction.eventId,
      amount: dto.amount ?? transaction.amount.toDecimal(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : transaction.dueDate,
      competenceDate: dto.competenceDate
        ? new Date(dto.competenceDate)
        : transaction.competenceDate,
      status: dto.status ?? transaction.status,
      ownership: dto.ownership ?? transaction.ownership,
      type: dto.type ?? transaction.type,
      paymentDate: dto.paymentDate
        ? new Date(dto.paymentDate)
        : transaction.paymentDate,
      accountId: dto.accountId ?? transaction.accountId,
      creditCardId: dto.creditCardId ?? transaction.creditCardId,
      notes: dto.notes ?? transaction.notes,
    });

    return this.repo.save(updatedTransaction);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
