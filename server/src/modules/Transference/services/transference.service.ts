import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Transference } from '../domain/transference.entity';
import {
  TRANSFERENCE_REPOSITORY,
  ITransferenceRepository,
} from '../infra/transference.repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { PlainDate } from '../../../utils/shared/types/plain-date';
import { CreateTransferenceDto } from '../dtos/create-transference.dto';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../Account/infra/account.repository.interface';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../Category/infra/category.repository.interface';
import { EventService } from '../../Event/services/event.service';
import { CreateEventDto } from '../../Event/dtos/create-event.dto';
@Injectable()
export class TransferenceService {
  constructor(
    @Inject(TRANSFERENCE_REPOSITORY)
    private readonly transferenceRepository: ITransferenceRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    private readonly eventService: EventService,
  ) {}

  async create(dto: CreateTransferenceDto): Promise<Transference> {
    const { date, sourceAccountId, destinationAccountId, notes } = dto;

    const amount = new Money(dto.amount);

    const source = await this.accountRepository.findById(sourceAccountId);
    const dest = await this.accountRepository.findById(destinationAccountId);
    if (!source || !dest) throw new NotFoundException('Invalid accounts');

    if (source.id === dest.id) {
      throw new BadRequestException(
        'Source and destination accounts cannot be the same',
      );
    }

    const categories = await this.categoryRepository.findTransferCategory();
    const expenseCategory = categories.find(
      (category) => category.type === TransactionType.EXPENSE,
    );
    const incomeCategory = categories.find(
      (category) => category.type === TransactionType.INCOME,
    );

    if (!expenseCategory || !incomeCategory) {
      throw new NotFoundException('Transference categories not found');
    }

    const sourceEventDto: CreateEventDto = {
      description: `Transference of ${amount.toString()} to ${dest.name}`,
      date: date,
      categoryId: expenseCategory.id,
      negotiatorId: undefined,
      transactions: [
        {
          amount: amount.toCents(),
          dueDate: date,
          competenceDate: date,
          installmentNumber: 1,
          status: TransactionStatus.PAID,
          paymentDate: date,
          ownership: Ownership.OWN,
          type: TransactionType.EXPENSE,
          accountId: source.id,
          notes,
        },
      ],
    };

    const destinationEventDto: CreateEventDto = {
      description: `Transference of ${amount.toString()} from ${source.name}`,
      date: date,
      categoryId: incomeCategory.id,
      negotiatorId: undefined,
      transactions: [
        {
          amount: amount.toCents(),
          dueDate: date,
          competenceDate: date,
          installmentNumber: 1,
          status: TransactionStatus.PAID,
          paymentDate: date,
          ownership: Ownership.OWN,
          type: TransactionType.INCOME,
          accountId: dest.id,
          notes,
        },
      ],
    };

    const sourceEvent = await this.eventService.create(sourceEventDto);
    const destinationEvent =
      await this.eventService.create(destinationEventDto);

    const transference = Transference.create({
      description: `Transference of ${amount.toString()} from ${source.name} to ${dest.name}`,
      amount,
      date: PlainDate.fromString(date),
      sourceAccountId,
      destinationAccountId,
      sourceEventId: sourceEvent.id,
      destinationEventId: destinationEvent.id,
      notes,
    });

    return this.transferenceRepository.save(transference);
  }

  async delete(id: string): Promise<void> {
    const transference = await this.transferenceRepository.findById(id);
    if (!transference) {
      throw new Error('Transference not found');
    }

    await this.transferenceRepository.delete(id);
  }

  async findById(id: string): Promise<Transference> {
    const transference = await this.transferenceRepository.findById(id);
    if (!transference) {
      throw new Error('Transference not found');
    }
    return transference;
  }

  async findAll(): Promise<Transference[]> {
    return this.transferenceRepository.findAll();
  }
}
