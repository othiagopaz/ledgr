import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transference } from '../domain/transference.entity';
import { TransferenceEntity } from './transference.orm-entity';
import { TransferenceMapper } from './transference.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { ITransferenceRepository } from './transference.repository.interface';

@Injectable()
export class TransferenceRepository
  extends BaseRepository<Transference, TransferenceEntity>
  implements ITransferenceRepository
{
  constructor(
    @InjectRepository(TransferenceEntity)
    repo: Repository<TransferenceEntity>,
    mapper: TransferenceMapper,
  ) {
    super(repo, mapper);
  }
}
