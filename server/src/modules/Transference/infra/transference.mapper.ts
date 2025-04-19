import { Injectable } from '@nestjs/common';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { TransferenceEntity } from './transference.orm-entity';
import { Money } from '../../../utils/shared/types/money';
import { PlainDate } from '../../../utils/shared/types/plain-date';
import { Transference } from '../domain/transference.entity';
import { AccountMapper } from '../../Account/infra/account.mapper';
import { EventMapper } from '../../Event/infra/event.mapper';

@Injectable()
export class TransferenceMapper
  implements Mapper<Transference, TransferenceEntity>
{
  constructor(
    private readonly accountMapper: AccountMapper,
    private readonly eventMapper: EventMapper,
  ) {}

  toDomain(orm: TransferenceEntity): Transference {
    return new Transference(
      orm.id,
      orm.description,
      new Money(orm.amount),
      PlainDate.fromDate(orm.date),
      orm.sourceAccount.id,
      orm.destinationAccount.id,
      orm.sourceEvent.id,
      orm.destinationEvent.id,
      orm.notes,
    );
  }

  toOrm(domain: Transference): TransferenceEntity {
    const orm = new TransferenceEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.amount = domain.amount.value;
    orm.date = domain.date.toDate();
    orm.sourceAccount = { id: domain.sourceAccountId } as any;
    orm.destinationAccount = { id: domain.destinationAccountId } as any;
    orm.sourceEvent = { id: domain.sourceEventId } as any;
    orm.destinationEvent = { id: domain.destinationEventId } as any;
    orm.notes = domain.notes;
    return orm;
  }
}
