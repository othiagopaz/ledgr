// src/modules/installment/mappers/installment.mapper.ts
import { Injectable } from '@nestjs/common';

import { Installment } from '@/domain/installments/installment.entity';
import { InstallmentEntity } from '../entities/installment.orm-entity';
import { Mapper } from '@/shared/base.repository';

@Injectable()
export class InstallmentMapper
  implements Mapper<Installment, InstallmentEntity>
{
  toDomain(orm: InstallmentEntity): Installment {
    return new Installment(
      orm.id,
      orm.financialEntryId,
      orm.amount,
      orm.dueDate,
      orm.competenceDate,
      orm.status,
      orm.paymentDate,
      orm.accountId,
      orm.creditCardId,
      orm.isRefundable,
      orm.isShared,
      orm.notes,
    );
  }

  toOrm(domain: Installment): InstallmentEntity {
    const orm = new InstallmentEntity();
    orm.id = domain.id;
    orm.financialEntryId = domain.financialEntryId;
    orm.amount = domain.amount;
    orm.dueDate = domain.dueDate;
    orm.competenceDate = domain.competenceDate;
    orm.status = domain.status;
    orm.paymentDate = domain.paymentDate;
    orm.accountId = domain.accountId;
    orm.creditCardId = domain.creditCardId;
    orm.notes = domain.notes;
    orm.isRefundable = domain.isRefundable;
    orm.isShared = domain.isShared;
    return orm;
  }
}
