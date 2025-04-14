import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettlementMapper } from './settlement.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { ISettlementRepository } from './settlement.repository.interface';
import { Settlement } from '../domain/settlement.entity';
import { SettlementEntity } from './settlement.orm-entity';

@Injectable()
export class SettlementRepository
  extends BaseRepository<Settlement, SettlementEntity>
  implements ISettlementRepository
{
  constructor(
    @InjectRepository(SettlementEntity)
    repo: Repository<SettlementEntity>,
    mapper: SettlementMapper,
  ) {
    super(repo, mapper);
  }

  protected getRelations(): string[] {
    return ['originalTransaction', 'linkedTransaction'];
  }
}

export const SETTLEMENT_REPOSITORY = Symbol('SETTLEMENT_REPOSITORY');
