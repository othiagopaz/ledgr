import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { InvoiceProps } from './invoice.types';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';

export class Invoice {
  constructor(
    public readonly id: string,
    public readonly creditCard: CreditCard,
    public referenceMonth: number,
    public referenceYear: number,
    public closingDate: Date,
    public dueDate: Date,
    public status: InvoiceStatus,
    public _amount?: Money,
    public transactions?: Transaction[],
    public paymentDate?: Date,
    public accountId?: string,
  ) {}

  static create(props: InvoiceProps): Invoice {
    if (
      !props.creditCard ||
      !props.referenceMonth ||
      !props.referenceYear ||
      !props.closingDate ||
      !props.dueDate ||
      !props.status
    ) {
      throw new BadRequestException('Missing required invoice properties.');
    }

    const invoiceId = uuidv4();

    const invoice = new Invoice(
      invoiceId,
      props.creditCard,
      props.referenceMonth,
      props.referenceYear,
      props.closingDate,
      props.dueDate,
      props.status,
      new Money(0),
      props.transactions,
      props.paymentDate,
      props.accountId,
    );

    invoice._amount = invoice.amount;

    return invoice;
  }

  static fromCreditCardAndDate(card: CreditCard, date: Date): Invoice {
    const referenceMonth = date.getMonth() + 1;
    const referenceYear = date.getFullYear();

    const closingDate = new Date(
      referenceYear,
      referenceMonth - 1,
      card.closingDay,
    );
    const dueDate = new Date(referenceYear, referenceMonth - 1, card.dueDay);

    return Invoice.create({
      creditCard: card,
      referenceMonth,
      referenceYear,
      closingDate,
      dueDate,
      status: InvoiceStatus.OPEN,
    });
  }

  get amount(): Money {
    if (!this.transactions || this.status !== InvoiceStatus.OPEN) {
      return new Money(0);
    }

    return this.transactions.reduce(
      (acc, trx) => acc.add(trx.amount),
      Money.zero(),
    );
  }
}
