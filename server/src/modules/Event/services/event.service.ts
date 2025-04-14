import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { IEventRepository } from '../infra/event.repository.interface';
import { EVENT_REPOSITORY } from '../infra/event.repository';
import { CreateEventDto } from '../dtos/create-event.dto';
import { UpdateEventDto } from '../dtos/update-event.dto';
import { Event } from '../domain/event.entity';
import { ICategoryRepository } from '../../Category/infra/category.repository.interface';
import { CATEGORY_REPOSITORY } from '../../Category/infra/category.repository';
import { IAccountRepository } from '../../Account/infra/account.repository.interface';
import { ACCOUNT_REPOSITORY } from '../../Account/infra/account.repository';
import { Account } from '../../Account/domain/account.entity';
import { TransactionCreationData } from '../domain/event.types';
import { ITransactionRepository } from '../../Transaction/infra/transaction.repository.interface';
import { TRANSACTION_REPOSITORY } from '../../Transaction/infra/transaction.repository';
import { ISettlementRepository } from '../../Settlement/infra/settlement.repository.interface';
import { SETTLEMENT_REPOSITORY } from '../../Settlement/infra/settlement.repository';

@Injectable()
export class EventService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ISettlementRepository,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const category = await this.categoryRepository.findById(dto.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const transactionData: TransactionCreationData[] = [];
    for (const txDto of dto.transactions) {
      let account: Account | undefined = undefined;
      if (txDto.accountId) {
        const foundAccount = await this.accountRepository.findById(
          txDto.accountId,
        );
        if (!foundAccount) {
          throw new NotFoundException(
            `Account with ID ${txDto.accountId} not found for transaction.`,
          );
        }
        account = foundAccount;
      }

      transactionData.push({
        amount: txDto.amount,
        dueDate: txDto.dueDate,
        competenceDate: txDto.competenceDate,
        installmentNumber: txDto.installmentNumber,
        status: txDto.status,
        ownership: txDto.ownership,
        type: txDto.type,
        paymentDate: txDto.paymentDate,
        account: account,
        creditCardId: txDto.creditCardId,
        notes: txDto.notes,
        settlements: txDto.settlements,
      });
    }

    const event = Event.create({
      description: dto.description,
      date: new Date(dto.date),
      category: category,
      negotiatorId: dto.negotiatorId,
      transactions: transactionData,
    });

    await this.eventRepository.save(event);

    await this.transactionRepository.saveMany(event.transactions ?? []);

    await this.settlementRepository.saveMany(
      event.transactions?.flatMap((tx) => tx.settlements ?? []) ?? [],
    );

    return event;
  }

  async findAll(): Promise<Event[]> {
    return this.eventRepository.findAll();
  }

  async findById(id: string): Promise<Event> {
    const entry = await this.eventRepository.findById(id);
    if (!entry) {
      throw new NotFoundException('Event not found');
    }
    return entry;
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const entry = await this.findById(id);
    if (!entry) {
      throw new NotFoundException('Event not found');
    }

    const category = await this.categoryRepository.findById(dto.categoryId);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const updatedEntry = new Event(
      entry.id,
      dto.description ?? entry.description,
      dto.date ? new Date(dto.date) : entry.date,
      category,
      dto.negotiatorId ?? entry.negotiatorId,
    );

    return this.eventRepository.save(updatedEntry);
  }
}
