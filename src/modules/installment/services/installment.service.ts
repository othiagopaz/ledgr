import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Installment } from '@/domain/installment/installment.entity';
import { InstallmentRepository } from '../repositories/installment.repository';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { UpdateInstallmentDto } from '../dtos/update-installment.dto';
import { InstallmentStatus } from '@/shared/enums/installment-status.enum';
import { CreateInstallmentDto } from '../dtos/create-installment.dto';
import { addMonths } from 'date-fns';
import { OwnershipType } from '@/shared/enums/ownership-type.enum';

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
    if (dto.paymentDate && !installment.isPaid()) {
      installment.markAsPaid(new Date(dto.paymentDate));
    }

    if (dto.dueDate && !installment.isPaid()) {
      installment.changeDueDate(new Date(dto.dueDate));
    }

    return this.repo.save(installment);
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

    if (!entry.accountId && !entry.creditCardId) {
      throw new BadRequestException(
        'Account or credit card is required to create installments',
      );
    }

    if (entry.installments === 1) {
      installments.push(
        Installment.create({
          amount: entry.amount,
          dueDate: entry.date,
          competenceDate: entry.date,
          financialEntryId: entry.id,
          status: InstallmentStatus.PENDING,
          isRefundable: entry.ownershipType === OwnershipType.REFUNDABLE,
          isShared: entry.ownershipType === OwnershipType.SHARED,
          notes: entry.description,
          accountId: entry.accountId,
          creditCardId: entry.creditCardId,
        }),
      );
    } else {
      const baseAmount =
        entry.installments === 1
          ? entry.amount
          : entry.amount / entry.installments;

      for (let i = 0; i < entry.installments; i++) {
        const dueDate =
          entry.installments === 1 ? entry.date : addMonths(entry.date, i);
        const competenceDate = this.determineCompetenceDate(entry, dueDate);

        const notes =
          entry.description + ' (' + (i + 1) + '/' + entry.installments + ')';

        installments.push(
          Installment.create({
            amount: baseAmount,
            dueDate,
            competenceDate,
            financialEntryId: entry.id,
            status: InstallmentStatus.PENDING,
            isRefundable: entry.ownershipType === OwnershipType.REFUNDABLE,
            isShared: entry.ownershipType === OwnershipType.SHARED,
            notes,
            accountId: entry.accountId ? entry.accountId : undefined,
            creditCardId: entry.creditCardId ? entry.creditCardId : undefined,
          }),
        );
      }
    }

    return installments;
  }

  determineCompetenceDate(entry: FinancialEntry, dueDate: Date): Date {
    return dueDate;
  }
}
