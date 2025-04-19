import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Transaction } from '../domain/transaction.entity';
import {
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../infra/transaction.repository.interface';
import { UpdateTransactionDto } from '../dtos/update-transaction.dto';
import { CreateTransactionDto } from '../dtos/create-transaction.dto';
import {
  IEventRepository,
  EVENT_REPOSITORY,
} from '../../Event/infra/event.repository.interface';
import {
  IAccountRepository,
  ACCOUNT_REPOSITORY,
} from '../../Account/infra/account.repository.interface';
import {
  ICreditCardRepository,
  CREDIT_CARD_REPOSITORY,
} from '../../CreditCard/infra/credit-card.repository.interface';
import { InvoiceService } from '../../Invoice/services/invoice.service';
import { TransactionCreationData } from '../../Event/domain/event.types';
import { PlainDate } from '../../../utils/shared/types/plain-date';

@Injectable()
export class TransactionService {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly repo: ITransactionRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: IEventRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly creditCardRepository: ICreditCardRepository,
    private readonly invoiceService: InvoiceService,
  ) {}

  async prepareTransaction(
    txDto: CreateTransactionDto,
  ): Promise<TransactionCreationData> {
    const account = txDto.accountId
      ? await this.accountRepository.findById(txDto.accountId)
      : undefined;

    if (txDto.accountId && !account) {
      throw new NotFoundException(
        `Account with ID ${txDto.accountId} not found for transaction.`,
      );
    }

    const creditCard = txDto.creditCardId
      ? await this.creditCardRepository.findById(txDto.creditCardId)
      : undefined;

    if (txDto.creditCardId && !creditCard) {
      throw new NotFoundException(
        `Credit card with ID ${txDto.creditCardId} not found for transaction.`,
      );
    }

    return {
      amount: txDto.amount,
      dueDate: PlainDate.parse(txDto.dueDate),
      competenceDate: PlainDate.parse(txDto.competenceDate),
      installmentNumber: txDto.installmentNumber,
      status: txDto.status,
      ownership: txDto.ownership,
      type: txDto.type,
      paymentDate: txDto.paymentDate
        ? PlainDate.parse(txDto.paymentDate)
        : undefined,
      account: account ?? undefined,
      creditCard: creditCard ?? undefined,
      notes: txDto.notes,
      settlements: txDto.settlements?.map((settlement) => ({
        amount: settlement.amount,
        dueDate: PlainDate.parse(settlement.dueDate),
        status: settlement.status,
        direction: settlement.direction,
        negotiatorId: settlement.negotiatorId,
      })),
    };
  }

  async attachInvoices(transactions: Transaction[]): Promise<void> {
    for (const tx of transactions) {
      if (!tx.creditCard) continue;

      const invoice = await this.invoiceService.findOrCreate(
        tx.creditCard,
        tx.paymentDate ?? tx.dueDate,
      );

      tx.invoice = invoice;

      await this.repo.save(tx);
    }
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

    let creditCard = transaction.creditCard;
    if (dto.creditCardId) {
      const foundCreditCard = await this.creditCardRepository.findById(
        dto.creditCardId,
      );

      if (!foundCreditCard) {
        throw new NotFoundException('Credit card not found');
      }
      creditCard = foundCreditCard;
    }

    const updatedTransaction = Transaction.create({
      event,
      amount: dto.amount ?? transaction.amount.toDecimal(),
      dueDate: dto.dueDate
        ? PlainDate.fromDate(new Date(dto.dueDate))
        : transaction.dueDate,
      competenceDate: dto.competenceDate
        ? PlainDate.fromDate(new Date(dto.competenceDate))
        : transaction.competenceDate,
      installmentNumber: dto.installmentNumber ?? transaction.installmentNumber,
      status: dto.status ?? transaction.status,
      ownership: dto.ownership ?? transaction.ownership,
      type: dto.type ?? transaction.type,
      paymentDate: dto.paymentDate
        ? PlainDate.fromDate(new Date(dto.paymentDate))
        : transaction.paymentDate,
      account,
      creditCard,
      notes: dto.notes ?? transaction.notes,
    });

    return this.repo.save(updatedTransaction);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
