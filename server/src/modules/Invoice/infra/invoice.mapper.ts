// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';
import { Invoice } from '../domain/invoice.entity';
import { InvoiceEntity } from './invoice.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { TransactionMapper } from '../../Transaction/infra/transaction.mapper';
import { CreditCardEntity } from '../../CreditCard/infra/credit-card.orm-entity';

@Injectable()
export class InvoiceMapper implements Mapper<Invoice, InvoiceEntity> {
  constructor(private readonly transactionMapper: TransactionMapper) {}

  toDomain(orm: InvoiceEntity): Invoice {
    return new Invoice(
      orm.id,
      orm.creditCard.id,
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
    orm.creditCard = { id: domain.creditCardId } as CreditCardEntity;
    return orm;
  }
}
