import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinancialEntryEntity } from './financial-entry.orm-entity';
import { FinancialEntry } from '../../domain/financial-entry/financial-entry.entity';
import { FinancialEntryMapper } from './financial-entry.mapper';
import { BaseRepository } from '../common/base.repository';

@Injectable()
export class FinancialEntryRepository extends BaseRepository<
  FinancialEntry,
  FinancialEntryEntity
> {
  constructor(
    @InjectRepository(FinancialEntryEntity)
    repo: Repository<FinancialEntryEntity>,
    mapper: FinancialEntryMapper,
  ) {
    super(repo, mapper);
  }
}
