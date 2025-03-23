import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFinancialEntryDto } from '../dtos/create-financial-entry.dto';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { FinancialEntryRepository } from '../repositories/financial-entry.repository';
import { InstallmentService } from '@/modules/installment/services/installment.service';
import { CategoryService } from '@/modules/category/services/category.service';
@Injectable()
export class FinancialEntryService {
  constructor(
    private readonly financialEntryRepository: FinancialEntryRepository,
    private readonly installmentService: InstallmentService,
    private readonly categoryService: CategoryService,
  ) {}

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
      ownershipType: dto.ownershipType,
      expectedRefundAmount: dto.expectedRefundAmount,
      refundInstallments: dto.refundInstallments,
      refundInstallmentDates: dto.refundInstallmentDates?.map(
        (date) => new Date(date),
      ),
      isOffBalance: dto.isOffBalance,
    });

    const category = await this.categoryService.findById(dto.categoryId);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.financialEntryRepository.save(entry);

    await this.installmentService.createFromEntry(entry);

    return entry;
  }

  async findAll(): Promise<FinancialEntry[]> {
    return this.financialEntryRepository.findAll();
  }

  async findById(id: string): Promise<FinancialEntry> {
    const entry = await this.financialEntryRepository.findById(id);
    if (!entry) {
      throw new NotFoundException('Financial entry not found');
    }
    return entry;
  }
}
