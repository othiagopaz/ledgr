import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '@/shared/base.repository';
import { FinancialEntryEntity } from '../entities/financial-entry.orm-entity';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { mapToDomain, mapToOrm } from '../mappers/financial-entry.mapper';

@Injectable()
export class FinancialEntryRepository extends BaseRepository<FinancialEntry> {
  constructor(
    @InjectRepository(FinancialEntryEntity)
    private readonly orm: Repository<FinancialEntryEntity>,
  ) {
    super(orm as unknown as Repository<FinancialEntry>);
  }

  override async save(entry: FinancialEntry): Promise<FinancialEntry> {
    const ormEntity = mapToOrm(entry);
    const saved = await this.orm.save(ormEntity);
    return mapToDomain(saved);
  }

  override async findById(id: string): Promise<FinancialEntry | null> {
    const found = await this.orm.findOne({ where: { id } });
    return found ? mapToDomain(found) : null;
  }
}
