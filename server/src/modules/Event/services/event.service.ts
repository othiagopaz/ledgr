import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { IEventRepository } from '../../../infrastructure/Event/event.repository.interface';
import { TransactionService } from '../../Transaction/services/transaction.service';
import { CategoryService } from '../../Category/services/category.service';
import { EVENT_REPOSITORY } from '../../../infrastructure/common/repository.tokens';
import { CreateEventDto } from '../dtos/create-event.dto';
import { UpdateEventDto } from '../dtos/update-event.dto';
import { Event } from '../../../domain/Event/event.entity';
@Injectable()
export class EventService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    private readonly transactionService: TransactionService,
    private readonly categoryService: CategoryService,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const entry = Event.create({
      description: dto.description,
      amount: dto.amount,
      installments: dto.installments,
      date: new Date(dto.date),
      type: dto.type,
      categoryId: dto.categoryId,
      creditCardId: dto.creditCardId,
      accountId: dto.accountId,
      ownershipType: dto.ownershipType,
      expectedRefundAmount: dto.expectedRefundAmount,
      refundInstallments: dto.refundInstallments,
      refundInstallmentDates: dto.refundInstallmentDates?.map(
        (date) => new Date(date),
      ),
      isOffBalance: dto.isOffBalance,
    });

    const category = await this.categoryService.findById(dto.categoryId);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.eventRepository.save(entry);

    await this.transactionService.createFromEntry(entry);

    return entry;
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
      dto.amount ?? entry.amount,
      dto.installments ?? entry.installments,
      dto.date ? new Date(dto.date) : entry.date,
      dto.type ?? entry.type,
      dto.categoryId ?? entry.categoryId,
      dto.creditCardId ?? entry.creditCardId,
      dto.accountId ?? entry.accountId,
      dto.ownershipType ?? entry.ownershipType,
      dto.expectedRefundAmount ?? entry.expectedRefundAmount,
      dto.refundInstallments ?? entry.refundInstallments,
      dto.refundInstallmentDates
        ? dto.refundInstallmentDates.map((date) => new Date(date))
        : entry.refundInstallmentDates,
      dto.isOffBalance ?? entry.isOffBalance,
    );

    return this.eventRepository.save(updatedEntry);
  }
}
