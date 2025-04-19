import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { IEventRepository } from '../infra/event.repository.interface';
import { EVENT_REPOSITORY } from '../infra/event.repository.interface';
import { CreateEventDto } from '../dtos/create-event.dto';
import { UpdateEventDto } from '../dtos/update-event.dto';
import { Event } from '../domain/event.entity';
import { ICategoryRepository } from '../../Category/infra/category.repository.interface';
import { CATEGORY_REPOSITORY } from '../../Category/infra/category.repository';
import { TransactionCreationData } from '../domain/event.types';
import {
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../../Transaction/infra/transaction.repository.interface';
import {
  ISettlementRepository,
  SETTLEMENT_REPOSITORY,
} from '../../Settlement/infra/settlement.repository.interface';
import { TransactionService } from '../../Transaction/services/transaction.service';
import { PlainDate } from '../../../utils/shared/types/plain-date';
@Injectable()
export class EventService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ISettlementRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const category = await this.categoryRepository.findById(dto.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const transactionData: TransactionCreationData[] = [];

    for (const tx of dto.transactions) {
      const transaction = await this.transactionService.prepareTransaction(tx);
      transactionData.push(transaction);
    }

    const event = Event.create({
      description: dto.description,
      date: PlainDate.fromString(dto.date),
      category: category,
      negotiatorId: dto.negotiatorId,
      transactions: transactionData,
    });

    await this.eventRepository.save(event);

    await this.transactionRepository.saveMany(event.transactions ?? []);

    await this.transactionService.attachInvoices(event.transactions ?? []);

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
      dto.date ? PlainDate.fromString(dto.date) : entry.date,
      category,
      dto.negotiatorId ?? entry.negotiatorId,
    );

    return this.eventRepository.save(updatedEntry);
  }
}
