import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreditCardEntity } from './credit-card.orm-entity';
import { CreditCard } from '../domain/credit-card.entity';
import { CreditCardMapper } from './credit-card.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { ICreditCardRepository } from './credit-card.repository.interface';

@Injectable()
export class CreditCardRepository
  extends BaseRepository<CreditCard, CreditCardEntity>
  implements ICreditCardRepository
{
  constructor(
    @InjectRepository(CreditCardEntity)
    repo: Repository<CreditCardEntity>,
    mapper: CreditCardMapper,
  ) {
    super(repo, mapper);
  }
}

export const CREDIT_CARD_REPOSITORY = Symbol('CREDIT_CARD_REPOSITORY');
