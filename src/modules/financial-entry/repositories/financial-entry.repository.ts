import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinancialEntryEntity } from '../entities/financial-entry.orm-entity';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { FinancialEntryMapper } from '../mappers/financial-entry.mapper';
import { BaseRepository } from '@/shared/base.repository';

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
