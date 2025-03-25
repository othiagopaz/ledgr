import { v4 as uuidv4 } from 'uuid';
import { InstallmentProps } from './installment.types';
import { InstallmentStatus } from '../../common/enums/installment-status.enum';

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
    if (!props.financialEntryId) {
      throw new Error('Financial entry ID is required');
    }

    if (!props.amount) {
      throw new Error('Amount is required');
    }

    if (!props.dueDate) {
      throw new Error('Due date is required');
    }

    if (!props.competenceDate) {
      throw new Error('Competence date is required');
    }

    if (!props.status && !InstallmentStatus[props.status]) {
      throw new Error(
        'Status is required and must be a valid InstallmentStatus',
      );
    }

    if (!props.accountId && !props.creditCardId) {
      throw new Error('Account or credit card is required');
    }

    return new Installment(
      uuidv4(),
      props.financialEntryId,
      props.amount,
      props.dueDate,
      props.competenceDate,
      props.status || InstallmentStatus.PENDING,
      props.paymentDate,
      props.accountId,
      props.creditCardId,
      props.isRefundable,
      props.isShared,
      props.notes,
    );
  }

  get isPaid(): boolean {
    return this.status === InstallmentStatus.PAID;
  }

  get isOverdue(): boolean {
    return this.status === InstallmentStatus.OVERDUE;
  }

  get isScheduled(): boolean {
    return this.status === InstallmentStatus.SCHEDULED;
  }

  get isCancelled(): boolean {
    return this.status === InstallmentStatus.CANCELLED;
  }

  markAsPaid(paymentDate: Date): void {
    if (this.isPaid) {
      throw new Error('Installment already paid');
    }

    this.status = InstallmentStatus.PAID;
    this.paymentDate = paymentDate;
  }

  changeDueDate(dueDate: Date): void {
    if (this.isPaid) {
      throw new Error('Installment already paid');
    }

    this.dueDate = dueDate;
  }

  set setStatus(status: InstallmentStatus) {
    if (this.isPaid) {
      throw new Error('Installment already paid');
    }

    this.status = status;
  }
}

// TODO: remover is refundable
// TODO: remover is shared
// TODO: criar isIncome
