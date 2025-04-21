// src/modules/installment/mappers/installment.mapper.ts
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { Transaction } from '../domain/transaction.entity';
import { TransactionEntity } from './transaction.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { EventMapper } from '../../Event/infra/event.mapper';
import { AccountMapper } from '../../Account/infra/account.mapper';
import { InvoiceMapper } from '../../Invoice/infra/invoice.mapper';
import { CreditCardMapper } from '../../CreditCard/infra/credit-card.mapper';
import { PlainDate } from '../../../utils/shared/types/plain-date';
@Injectable()
export class TransactionMapper
  implements Mapper<Transaction, TransactionEntity>
{
  constructor(
    @Inject(forwardRef(() => EventMapper))
    private readonly eventMapper: EventMapper,
    @Inject(forwardRef(() => AccountMapper))
    private readonly accountMapper: AccountMapper,
    @Inject(forwardRef(() => InvoiceMapper))
    private readonly invoiceMapper: InvoiceMapper,
    @Inject(forwardRef(() => CreditCardMapper))
    private readonly creditCardMapper: CreditCardMapper,
  ) {}

  toDomain(orm: TransactionEntity): Transaction {
    return new Transaction(
      orm.id,
      orm.eventId ?? undefined,
      new Money(orm.amount),
      PlainDate.parse(orm.dueDate),
      PlainDate.parse(orm.competenceDate),
      orm.installmentNumber,
      orm.status,
      orm.ownership,
      orm.type,
      orm.paymentDate ? PlainDate.parse(orm.paymentDate) : undefined,
      orm.account ? this.accountMapper.toDomain(orm.account) : undefined,
      orm.creditCard
        ? this.creditCardMapper.toDomain(orm.creditCard)
        : undefined,
      orm.notes,
      undefined,
      orm.invoice ? this.invoiceMapper.toDomain(orm.invoice) : undefined,
    );
  }

  toOrm(domain: Transaction): TransactionEntity {
    const orm = new TransactionEntity();
    orm.id = domain.id;
    orm.eventId = domain.eventId;
    orm.amount = domain.amount.toCents();
    orm.dueDate = domain.dueDate.toDate();
    orm.competenceDate = domain.competenceDate.toDate();
    orm.installmentNumber = domain.installmentNumber;
    orm.status = domain.status;
    orm.paymentDate = domain.paymentDate?.toDate();
    orm.account = domain.account
      ? this.accountMapper.toOrm(domain.account)
      : undefined;
    orm.creditCard = domain.creditCard
      ? this.creditCardMapper.toOrm(domain.creditCard)
      : undefined;
    orm.notes = domain.notes;
    orm.ownership = domain.ownership;
    orm.type = domain.type;
    orm.invoice = domain.invoice
      ? this.invoiceMapper.toOrm(domain.invoice)
      : undefined;
    return orm;
  }
}
