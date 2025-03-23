import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFinancialEntryDto } from '../dto/create-financial-entry.dto';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { FinancialEntryRepository } from '../repositories/financial-entry.repository';

@Injectable()
export class FinancialEntryService {
  constructor(private readonly repo: FinancialEntryRepository) {}

  async create(dto: CreateFinancialEntryDto): Promise<FinancialEntry> {
    const entry = FinancialEntry.create({
      description: dto.description,
      amount: dto.amount,
      installments: dto.installments,
      date: new Date(dto.date),
      type: dto.type,
      categoryId: dto.categoryId,
      creditCardId: dto.creditCardId,
      accountId: dto.accountId,
    });

    await this.repo.save(entry);
    return entry;
  }

  async findAll(): Promise<FinancialEntry[]> {
    return this.repo.findAll();
  }

  async findById(id: string): Promise<FinancialEntry> {
    const entry = await this.repo.findById(id);
    if (!entry) {
      throw new NotFoundException('Financial entry not found');
    }
    return entry;
  }
}
