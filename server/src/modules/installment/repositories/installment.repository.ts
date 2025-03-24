import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Installment } from '../../../domain/installment/installment.entity';
import { InstallmentEntity } from '../entities/installment.orm-entity';
import { InstallmentMapper } from '../mappers/installment.mapper';
import { BaseRepository } from '../../../shared/base.repository';

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
