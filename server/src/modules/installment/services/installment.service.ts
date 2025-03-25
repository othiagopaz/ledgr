import { Injectable, NotFoundException } from '@nestjs/common';
import { Installment } from '../../../domain/installment/installment.entity';
import { InstallmentRepository } from '../../../infrastructure/installment/installment.repository';
import { FinancialEntry } from '../../../domain/financial-entry/financial-entry.entity';
import { UpdateInstallmentDto } from '../dtos/update-installment.dto';
import { CreateInstallmentDto } from '../dtos/create-installment.dto';

@Injectable()
export class InstallmentService {
  constructor(private readonly repo: InstallmentRepository) {}

  async create(dto: CreateInstallmentDto): Promise<Installment> {
    const entry = Installment.create({
      financialEntryId: dto.financialEntryId,
      amount: dto.amount,
      dueDate: dto.dueDate,
      competenceDate: dto.competenceDate,
      status: dto.status,
      paymentDate: dto.paymentDate,
      accountId: dto.accountId,
      creditCardId: dto.creditCardId,
      isRefundable: dto.isRefundable,
      isShared: dto.isShared,
      notes: dto.notes,
    });

    await this.repo.save(entry);
    return entry;
  }

  async findAll(): Promise<Installment[]> {
    return this.repo.findAll();
  }

  async findById(id: string): Promise<Installment> {
    const entry = await this.repo.findById(id);
    if (!entry) {
      throw new NotFoundException('Installment not found');
    }
    return entry;
  }

  async findByFinancialEntryId(
    financialEntryId: string,
  ): Promise<Installment[] | null> {
    return this.repo.findWithFilters({ financialEntryId });
  }

  async update(id: string, dto: UpdateInstallmentDto): Promise<Installment> {
    const installment = await this.findById(id);
    if (!installment) {
      throw new NotFoundException('Installment not found');
    }

    const updatedInstallment = new Installment(
      installment.id,
      dto.financialEntryId ?? installment.financialEntryId,
      dto.amount ?? installment.amount,
      dto.dueDate ? new Date(dto.dueDate) : installment.dueDate,
      dto.competenceDate
        ? new Date(dto.competenceDate)
        : installment.competenceDate,
      dto.status ?? installment.status,
      dto.paymentDate ? new Date(dto.paymentDate) : installment.paymentDate,
      dto.accountId ?? installment.accountId,
      dto.creditCardId ?? installment.creditCardId,
      dto.isRefundable ?? installment.isRefundable,
      dto.isShared ?? installment.isShared,
      dto.notes ?? installment.notes,
    );

    return this.repo.save(updatedInstallment);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async createFromEntry(entry: FinancialEntry) {
    const installments = entry.generateInstallments();
    await this.repo.saveMany(installments);
    return installments;
  }
}
