// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Invoice } from '../domain/invoice.entity';
import { InvoiceEntity } from './invoice.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { TransactionMapper } from '../../Transaction/infra/transaction.mapper';
import { CreditCardMapper } from '../../CreditCard/infra/credit-card.mapper';

@Injectable()
export class InvoiceMapper implements Mapper<Invoice, InvoiceEntity> {
  constructor(
    @Inject(forwardRef(() => TransactionMapper))
    private readonly transactionMapper: TransactionMapper,
    private readonly creditCardMapper: CreditCardMapper,
  ) {}

  toDomain(orm: InvoiceEntity): Invoice {
    return new Invoice(
      orm.id,
      this.creditCardMapper.toDomain(orm.creditCard),
      orm.referenceMonth,
      orm.referenceYear,
      orm.closingDate,
      orm.dueDate,
      orm.status,
      new Money(0),
      orm.transactions.map((transaction) =>
        this.transactionMapper.toDomain(transaction),
      ),
      orm.paymentDate,
      orm.accountId,
    );
  }

  toOrm(domain: Invoice): InvoiceEntity {
    const orm = new InvoiceEntity();
    orm.id = domain.id;
    orm.referenceMonth = domain.referenceMonth;
    orm.referenceYear = domain.referenceYear;
    orm.closingDate = domain.closingDate;
    orm.dueDate = domain.dueDate;
    orm.status = domain.status;
    orm.transactions =
      domain.transactions?.map((transaction) =>
        this.transactionMapper.toOrm(transaction),
      ) ?? [];
    orm.paymentDate = domain.paymentDate ?? undefined;
    orm.accountId = domain.accountId ?? undefined;
    orm.creditCard = this.creditCardMapper.toOrm(domain.creditCard);
    return orm;
  }
}
