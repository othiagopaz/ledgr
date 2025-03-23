import { v4 as uuidv4 } from 'uuid';
import { InstallmentProps } from './installment.types';
import { InstallmentStatus } from '../../shared/enums/installment-status.enum';

export class Installment {
  constructor(
    public readonly id: string,
    public readonly financialEntryId: string,
    public amount: number,
    public dueDate: Date,
    public competenceDate: Date,
    public status: InstallmentStatus,
    public paymentDate?: Date,
    public accountId?: string,
    public creditCardId?: string,
    public isRefundable?: boolean,
    public isShared?: boolean,
    public notes?: string,
  ) {}

  static create(props: InstallmentProps): Installment {
    return new Installment(
      uuidv4(),
      props.financialEntryId,
      props.amount,
      props.dueDate,
      props.competenceDate,
      props.status,
      props.paymentDate,
      props.accountId,
      props.creditCardId,
      props.isRefundable,
      props.isShared,
      props.notes,
    );
  }

  isPaid(): boolean {
    return this.status === InstallmentStatus.PAID;
  }

  isOverdue(): boolean {
    return this.status === InstallmentStatus.OVERDUE;
  }

  isScheduled(): boolean {
    return this.status === InstallmentStatus.SCHEDULED;
  }

  isCancelled(): boolean {
    return this.status === InstallmentStatus.CANCELLED;
  }

  markAsPaid(paymentDate: Date): void {
    if (this.isPaid()) {
      throw new Error('Installment already paid');
    }

    this.status = InstallmentStatus.PAID;
    this.paymentDate = paymentDate;
  }

  changeDueDate(dueDate: Date): void {
    if (this.isPaid()) {
      throw new Error('Installment already paid');
    }

    this.dueDate = dueDate;
  }
}
