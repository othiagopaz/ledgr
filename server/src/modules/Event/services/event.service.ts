import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { IEventRepository } from '../../../infrastructure/Event/event.repository.interface';
import { TransactionService } from '../../Transaction/services/transaction.service';
import { EVENT_REPOSITORY } from '../../../infrastructure/common/repository.tokens';
import { CreateEventDto } from '../dtos/create-event.dto';
import { UpdateEventDto } from '../dtos/update-event.dto';
import { Event } from '../../../domain/Event/event.entity';
import { ICategoryRepository } from '../../../infrastructure/Category/category.repository.interface';
import { Transaction } from '../../../domain/Transaction/transaction.entity';
import { CATEGORY_REPOSITORY } from '../../../infrastructure/common/repository.tokens';
import { Money } from '../../../common/types/money';

@Injectable()
export class EventService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    private readonly transactionService: TransactionService,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const category = await this.categoryRepository.findById(dto.categoryId);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const event = Event.create({
      description: dto.description,
      amount: dto.amount,
      installments: dto.installments,
      competenceDate: new Date(dto.competenceDate),
      type: dto.type,
      categoryId: dto.categoryId,
      expectedRefundAmount: dto.expectedRefundAmount,
      transactions: dto.transactions,
    });

    await this.eventRepository.save(event);

    const transactions: Transaction[] = await Promise.all(
      dto.transactions.map((transactionDto) => {
        const transaction = {
          ...transactionDto,
          eventId: event.id,
          amount: transactionDto.amount,
        };
        return this.transactionService.create(transaction);
      }),
    );

    if (transactions) {
      event.transactions = transactions;
    }

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

    const updatedEntry = new Event(
      entry.id,
      dto.description ?? entry.description,
      dto.amount ? new Money(dto.amount) : entry.amount,
      dto.installments ?? entry.installments,
      dto.competenceDate ? new Date(dto.competenceDate) : entry.competenceDate,
      dto.type ?? entry.type,
      dto.categoryId ?? entry.categoryId,
      dto.expectedRefundAmount
        ? new Money(dto.expectedRefundAmount)
        : entry.expectedRefundAmount,
    );

    return this.eventRepository.save(updatedEntry);
  }
}
