import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Settlement } from '../domain/settlement.entity';
import { SettlementOrmEntity } from './settlement.orm-entity';
import { SettlementMapper } from './settlement.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { ISettlementRepository } from './settlement.repository.interface';

@Injectable()
export class SettlementRepository
  extends BaseRepository<Settlement, SettlementOrmEntity>
  implements ISettlementRepository
{
  protected repo: Repository<SettlementOrmEntity>;

  constructor(
    @InjectRepository(SettlementOrmEntity)
    repo: Repository<SettlementOrmEntity>,
    mapper: SettlementMapper,
  ) {
    super(repo, mapper);
    this.repo = repo;
  }
}
