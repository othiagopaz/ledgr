import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { InvoiceProps } from './invoice.types';

export class Invoice {
  constructor(
    public readonly id: string,
    public readonly creditCardId: string,
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
      !props.creditCardId ||
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
      props.creditCardId,
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
