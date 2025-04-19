import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { InvoiceProps } from './invoice.types';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
import { PlainDate } from '../../../utils/shared/types/plain-date';

export class Invoice {
  constructor(
    public readonly id: string,
    public readonly creditCard: CreditCard,
    public referenceMonth: number,
    public referenceYear: number,
    public closingDate: PlainDate,
    public dueDate: PlainDate,
    public status: InvoiceStatus,
    public _amount?: Money,
    public transactions?: Transaction[],
    public paymentDate?: PlainDate,
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

  static fromCreditCardAndDate(card: CreditCard, date: PlainDate): Invoice {
    const purchaseDate = date.toDate();

    // Primeiro dueDate estimado (fatura candidata)
    let dueDate = PlainDate.fromDate(
      new Date(
        purchaseDate.getFullYear(),
        purchaseDate.getMonth(),
        card.dueDay,
      ),
    );

    let closingDate = PlainDate.fromDate(
      new Date(
        dueDate.toDate().getFullYear(),
        dueDate.toDate().getMonth(),
        dueDate.toDate().getDate() - card.estimatedDaysBeforeDue,
      ),
    );

    // Se a compra for depois do fechamento, joga para próxima fatura
    if (purchaseDate > closingDate.toDate()) {
      dueDate = PlainDate.fromDate(
        new Date(
          dueDate.toDate().getFullYear(),
          dueDate.toDate().getMonth() + 1,
          card.dueDay,
        ),
      );

      closingDate = PlainDate.fromDate(
        new Date(
          dueDate.toDate().getFullYear(),
          dueDate.toDate().getMonth(),
          dueDate.toDate().getDate() - card.estimatedDaysBeforeDue,
        ),
      );
    }

    const referenceMonth = dueDate.toDate().getMonth() + 1;
    const referenceYear = dueDate.toDate().getFullYear();

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
