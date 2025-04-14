import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Transaction } from '../domain/transaction.entity';
import { ITransactionRepository } from '../infra/transaction.repository.interface';
import { UpdateTransactionDto } from '../dtos/update-transaction.dto';
import { CreateTransactionDto } from '../dtos/create-transaction.dto';
import { TRANSACTION_REPOSITORY } from '../infra/transaction.repository';
import { IEventRepository } from '../../Event/infra/event.repository.interface';
import { EVENT_REPOSITORY } from '../../Event/infra/event.repository';
import { IAccountRepository } from '../../Account/infra/account.repository.interface';
import { ACCOUNT_REPOSITORY } from '../../Account/infra/account.repository';
@Injectable()
export class TransactionService {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly repo: ITransactionRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async create(dto: CreateTransactionDto): Promise<Transaction> {
    const event = await this.eventRepository.findById(dto.eventId);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const account = dto.accountId
      ? await this.accountRepository.findById(dto.accountId)
      : undefined;

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const transaction = Transaction.create({
      event,
      amount: dto.amount,
      dueDate: new Date(dto.dueDate),
      competenceDate: new Date(dto.competenceDate),
      installmentNumber: dto.installmentNumber,
      status: dto.status,
      ownership: dto.ownership,
      type: dto.type,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
      account,
      creditCardId: dto.creditCardId,
      notes: dto.notes,
    });

    await this.repo.save(transaction);
    return transaction;
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

    let event = transaction.event;
    if (dto.eventId) {
      const foundEvent = await this.eventRepository.findById(dto.eventId);

      if (!foundEvent) {
        throw new NotFoundException('Event not found');
      }
      event = foundEvent;
    } else {
      throw new BadRequestException('Event is required');
    }

    let account = transaction.account;
    if (dto.accountId) {
      const foundAccount = await this.accountRepository.findById(dto.accountId);

      if (!foundAccount) {
        throw new NotFoundException('Account not found');
      }
      account = foundAccount;
    }

    const updatedTransaction = Transaction.create({
      event,
      amount: dto.amount ?? transaction.amount.toDecimal(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : transaction.dueDate,
      competenceDate: dto.competenceDate
        ? new Date(dto.competenceDate)
        : transaction.competenceDate,
      installmentNumber: dto.installmentNumber ?? transaction.installmentNumber,
      status: dto.status ?? transaction.status,
      ownership: dto.ownership ?? transaction.ownership,
      type: dto.type ?? transaction.type,
      paymentDate: dto.paymentDate
        ? new Date(dto.paymentDate)
        : transaction.paymentDate,
      account,
      creditCardId: dto.creditCardId ?? transaction.creditCardId,
      notes: dto.notes ?? transaction.notes,
    });

    return this.repo.save(updatedTransaction);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
