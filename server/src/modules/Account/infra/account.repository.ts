import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from '../domain/account.entity';
import { AccountEntity } from './account.orm-entity';
import { AccountMapper } from './account.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { IAccountRepository } from './account.repository.interface';

@Injectable()
export class AccountRepository
  extends BaseRepository<Account, AccountEntity>
  implements IAccountRepository
{
  constructor(
    @InjectRepository(AccountEntity)
    repo: Repository<AccountEntity>,
    mapper: AccountMapper,
  ) {
    super(repo, mapper);
  }
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
