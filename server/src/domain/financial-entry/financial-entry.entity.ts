import { v4 as uuidv4 } from 'uuid';
import { EntryType } from '../../common/enums/entry-type.enum';
import { FinancialEntryProps } from './financial-entry.types';
import { OwnershipType } from '../../common/enums/ownership-type.enum';
import { Installment } from '../installment/installment.entity';
import { InstallmentStatus } from '../../common/enums/installment-status.enum';
import { addMonths } from 'date-fns';
export class FinancialEntry {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly amount: number,
    public readonly installments: number,
    public readonly date: Date,
    public readonly type: EntryType,
    public readonly categoryId: string,
    public readonly creditCardId?: string,
    public readonly accountId?: string,
    public readonly ownershipType?: OwnershipType,
    public readonly expectedRefundAmount?: number,
    public readonly refundInstallments?: number,
    public readonly refundInstallmentDates?: Date[],
    public readonly isOffBalance?: boolean,
  ) {}

  static create(props: FinancialEntryProps): FinancialEntry {
    if (!props.accountId || !props.creditCardId) {
      throw new Error('Account or credit card is required');
    }

    return new FinancialEntry(
      uuidv4(),
      props.description,
      props.amount,
      props.installments,
      props.date,
      props.type,
      props.categoryId,
      props.creditCardId,
      props.accountId,
      props.ownershipType,
      props.expectedRefundAmount,
      props.refundInstallments,
      props.refundInstallmentDates,
      props.isOffBalance,
    );
  }

  isIncome(): boolean {
    return this.type === EntryType.INCOME;
  }

  isExpense(): boolean {
    return this.type === EntryType.EXPENSE;
  }

  generateInstallments(): Installment[] {
    const installments: Installment[] = [];

    for (let i = 0; i < this.installments; i++) {
      const dueDate = addMonths(this.date, i);

      const competenceDate = this.date;

      installments.push(
        Installment.create({
          amount: this.amount / this.installments,
          dueDate: dueDate,
          competenceDate,
          financialEntryId: this.id,
          status: InstallmentStatus.PENDING,
          isRefundable: this.ownershipType === OwnershipType.REFUNDABLE,
          isShared: this.ownershipType === OwnershipType.SHARED,
          notes: this.description,
          accountId: this.accountId,
          creditCardId: this.creditCardId,
        }),
      );
    }

    return installments;
  }
}

//TODO: criar maneira de fazer refundable e shared
