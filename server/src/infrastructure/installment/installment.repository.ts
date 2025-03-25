import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Installment } from '../../domain/installment/installment.entity';
import { InstallmentEntity } from './installment.orm-entity';
import { InstallmentMapper } from './installment.mapper';
import { BaseRepository } from '../common/base.repository';

@Injectable()
export class InstallmentRepository extends BaseRepository<
  Installment,
  InstallmentEntity
> {
  constructor(
    @InjectRepository(InstallmentEntity)
    repo: Repository<InstallmentEntity>,
    mapper: InstallmentMapper,
  ) {
    super(repo, mapper);
  }
}
