import { Injectable, NotFoundException } from '@nestjs/common';
import { Installment } from '@/domain/installments/installment.entity';
import { InstallmentRepository } from '../repositories/installment.repository';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { UpdateInstallmentDto } from '../dto/update-installment.dto';
import { InstallmentStatus } from '@/shared/enums/installment-status.enum';
import { CreateInstallmentDto } from '../dto/create-installment.dto';
import { addMonths } from 'date-fns';

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

    const updated = Installment.update(installment, {
      financialEntryId: installment.financialEntryId,
      amount: dto.amount ?? installment.amount,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : installment.dueDate,
      competenceDate: dto.competenceDate
        ? new Date(dto.competenceDate)
        : installment.competenceDate,
      status: dto.status ?? installment.status,
      paymentDate: dto.paymentDate
        ? new Date(dto.paymentDate)
        : installment.paymentDate,
      accountId: dto.accountId ?? installment.accountId,
      creditCardId: dto.creditCardId ?? installment.creditCardId,
      isRefundable: dto.isRefundable ?? installment.isRefundable,
      isShared: dto.isShared ?? installment.isShared,
      notes: dto.notes ?? installment.notes,
    });

    if (dto.paymentDate && !installment.isPaid()) {
      updated.markAsPaid(new Date(dto.paymentDate));
    }

    if (dto.dueDate && !installment.isPaid()) {
      updated.changeDueDate(new Date(dto.dueDate));
    }

    return this.repo.save(updated);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async createFromEntry(entry: FinancialEntry) {
    const installments = this.generateFromFinancialEntry(entry);
    await this.repo.saveMany(installments);
    return installments;
  }

  generateFromFinancialEntry(entry: FinancialEntry): Installment[] {
    const installments: Installment[] = [];

    const baseAmount =
      entry.installments === 1
        ? entry.amount
        : entry.amount / entry.installments;

    for (let i = 0; i < entry.installments; i++) {
      const dueDate =
        entry.installments === 1 ? entry.date : addMonths(entry.date, i);
      const competenceDate = this.determineCompetenceDate(entry, dueDate);

      installments.push(
        Installment.create({
          amount: baseAmount,
          dueDate,
          competenceDate,
          financialEntryId: entry.id,
          status: InstallmentStatus.PENDING,
        }),
      );
    }

    return installments;
  }

  determineCompetenceDate(entry: FinancialEntry, dueDate: Date): Date {
    return dueDate;
  }
}
