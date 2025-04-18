import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Invoice } from '../domain/invoice.entity';
import {
  IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../infra/invoice.repository.interface';
import { CreateInvoiceDto } from '../dtos/create-invoice.dto';
import {
  ICreditCardRepository,
  CREDIT_CARD_REPOSITORY,
} from '../../CreditCard/infra/credit-card.repository.interface';
import {
  IAccountRepository,
  ACCOUNT_REPOSITORY,
} from '../../Account/infra/account.repository.interface';
import { UpdateInvoiceDto } from '../dtos/update-invoice.dto';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly repo: IInvoiceRepository,
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly creditCardRepository: ICreditCardRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const creditCard = await this.creditCardRepository.findById(
      dto.creditCardId,
    );

    if (!creditCard) {
      throw new NotFoundException('Credit card not found');
    }

    const invoice = Invoice.create({
      creditCard,
      referenceMonth: dto.referenceMonth,
      referenceYear: dto.referenceYear,
      closingDate: new Date(dto.closingDate),
      dueDate: new Date(dto.dueDate),
      status: dto.status,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
      accountId: dto.accountId,
    });

    await this.repo.save(invoice);

    return invoice;
  }

  async findOrCreate(creditCard: CreditCard, date: Date): Promise<Invoice> {
    const invoice = await this.repo.findOne({
      creditCard: { id: creditCard.id },
      referenceMonth: date.getMonth(),
      referenceYear: date.getFullYear(),
    });
    if (invoice) {
      return invoice;
    }
    const newInvoice = Invoice.fromCreditCardAndDate(creditCard, date);
    await this.repo.save(newInvoice);
    return newInvoice;
  }

  findAll(): Promise<Invoice[]> {
    return this.repo.findAll();
  }

  async findById(id: string): Promise<Invoice> {
    const invoice = await this.repo.findById(id);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findById(id);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    let creditCard = invoice.creditCard;
    if (dto.creditCardId) {
      const foundCreditCard = await this.creditCardRepository.findById(
        dto.creditCardId,
      );

      if (!foundCreditCard) {
        throw new NotFoundException('Credit card not found');
      }
      creditCard = foundCreditCard;
    } else {
      throw new BadRequestException('Credit card is required');
    }

    let accountId = invoice.accountId;
    if (dto.accountId) {
      const foundAccount = await this.accountRepository.findById(dto.accountId);

      if (!foundAccount) {
        throw new NotFoundException('Account not found');
      }
      accountId = foundAccount.id;
    }

    const updatedInvoice = Invoice.create({
      creditCard,
      referenceMonth: dto.referenceMonth ?? invoice.referenceMonth,
      referenceYear: dto.referenceYear ?? invoice.referenceYear,
      closingDate: dto.closingDate
        ? new Date(dto.closingDate)
        : invoice.closingDate,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate,
      status: dto.status ?? invoice.status,
      paymentDate: dto.paymentDate
        ? new Date(dto.paymentDate)
        : invoice.paymentDate,
      accountId,
    });

    return this.repo.save(updatedInvoice);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
