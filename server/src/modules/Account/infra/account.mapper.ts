import { Injectable } from '@nestjs/common';
import { Mapper } from '../../../core/shared/infra/repository.interface';
import { Account } from '../domain/account.entity';
import { AccountEntity } from './account.orm-entity';
@Injectable()
export class AccountMapper implements Mapper<Account, AccountEntity> {
  toDomain(orm: AccountEntity): Account {
    return new Account(
      orm.id,
      orm.name,
      orm.type,
      orm.initialBalance,
      orm.institution,
      orm.color,
      orm.isArchived,
      orm.userId,
    );
  }

  toOrm(domain: Account): AccountEntity {
    const orm = new AccountEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.type = domain.type;
    orm.initialBalance = domain.initialBalance;
    orm.institution = domain.institution;
    orm.color = domain.color;
    orm.isArchived = domain.isArchived ?? false;
    orm.userId = domain.userId;
    return orm;
  }
}
