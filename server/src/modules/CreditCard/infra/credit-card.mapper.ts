// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';
import { CreditCard } from '../domain/credit-card.entity';
import { CreditCardEntity } from './credit-card.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { Money } from '../../../utils/shared/types/money';

@Injectable()
export class CreditCardMapper implements Mapper<CreditCard, CreditCardEntity> {
  toDomain(orm: CreditCardEntity): CreditCard {
    return new CreditCard(
      orm.id,
      orm.name,
      orm.estimatedDaysBeforeDue,
      orm.dueDay,
      orm.flag,
      orm.isArchived,
      new Money(orm.limit),
      orm.institution,
      orm.userId,
    );
  }

  toOrm(domain: CreditCard): CreditCardEntity {
    const orm = new CreditCardEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.estimatedDaysBeforeDue = domain.estimatedDaysBeforeDue;
    orm.dueDay = domain.dueDay;
    orm.flag = domain.flag;
    orm.isArchived = domain.isArchived;
    orm.limit = domain.limit?.toCents() ?? 0;
    orm.institution = domain.institution ?? '';
    orm.userId = domain.userId ?? '';
    return orm;
  }
}
