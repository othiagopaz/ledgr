import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { IEventRepository } from '../infra/event.repository.interface';
import { TransactionService } from '../../Transaction/services/transaction.service';
import { EVENT_REPOSITORY } from '../../../utils/shared/infra/repository.tokens';
import { CreateEventDto } from '../dtos/create-event.dto';
import { UpdateEventDto } from '../dtos/update-event.dto';
import { Event } from '../domain/event.entity';
import { ICategoryRepository } from '../../Category/infra/category.repository.interface';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { CATEGORY_REPOSITORY } from '../../../utils/shared/infra/repository.tokens';

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
      date: new Date(dto.date),
      categoryId: dto.categoryId,
      negotiatorId: dto.negotiatorId,
      transactions: dto.transactions,
    });

    await this.eventRepository.save(event);

    const transactions: Transaction[] = await Promise.all(
      dto.transactions.map((transactionDto) => {
        const transaction = {
          ...transactionDto,
          eventId: event.id,
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
      dto.date ? new Date(dto.date) : entry.date,
      dto.negotiatorId ?? entry.negotiatorId,
      dto.categoryId ?? entry.categoryId,
    );

    return this.eventRepository.save(updatedEntry);
  }
}
