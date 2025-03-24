import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from '../../../domain/account/account.entity';
import { AccountEntity } from '../entities/account.orm-entity';
import { AccountMapper } from '../mappers/account.mapper';
import { BaseRepository } from '../../../shared/base.repository';

@Injectable()
export class AccountRepository extends BaseRepository<Account, AccountEntity> {
  constructor(
    @InjectRepository(AccountEntity)
    repo: Repository<AccountEntity>,
    mapper: AccountMapper,
  ) {
    super(repo, mapper);
  }
}
