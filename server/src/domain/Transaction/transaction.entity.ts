import { v4 as uuidv4 } from 'uuid';
import { TransactionProps } from './transaction.types';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly eventId: string,
    public amount: number,
    public dueDate: Date,
    public competenceDate: Date,
    public status: TransactionStatus,
    public paymentDate?: Date,
    public accountId?: string,
    public creditCardId?: string,
    public isRefundable?: boolean,
    public isShared?: boolean,
    public notes?: string,
  ) {}

  static create(props: TransactionProps): Transaction {
    if (!props.eventId) {
      throw new Error('Event ID is required');
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

    if (!props.status && !TransactionStatus[props.status]) {
      throw new Error(
        'Status is required and must be a valid TransactionStatus',
      );
    }

    if (!props.accountId && !props.creditCardId) {
      throw new Error('Account or credit card is required');
    }

    return new Transaction(
      uuidv4(),
      props.eventId,
      props.amount,
      props.dueDate,
      props.competenceDate,
      props.status || TransactionStatus.PENDING,
      props.paymentDate,
      props.accountId,
      props.creditCardId,
      props.isRefundable,
      props.isShared,
      props.notes,
    );
  }

  get isPaid(): boolean {
    return this.status === TransactionStatus.PAID;
  }

  get isOverdue(): boolean {
    return this.status === TransactionStatus.OVERDUE;
  }

  get isScheduled(): boolean {
    return this.status === TransactionStatus.SCHEDULED;
  }

  get isCancelled(): boolean {
    return this.status === TransactionStatus.CANCELLED;
  }

  markAsPaid(paymentDate: Date): void {
    if (this.isPaid) {
      throw new Error('Transaction already paid');
    }

    this.status = TransactionStatus.PAID;
    this.paymentDate = paymentDate;
  }

  changeDueDate(dueDate: Date): void {
    if (this.isPaid) {
      throw new Error('Transaction already paid');
    }

    this.dueDate = dueDate;
  }

  set setStatus(status: TransactionStatus) {
    if (this.isPaid) {
      throw new Error('Transaction already paid');
    }

    this.status = status;
  }
}

// TODO: remover is refundable
// TODO: remover is shared
// TODO: criar isIncome
