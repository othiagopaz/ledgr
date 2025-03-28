import { v4 as uuidv4 } from 'uuid';
import { EventType } from '../../common/enums/event-type.enum';
import { EventProps } from './event.types';
import { OwnershipType } from '../../common/enums/ownership-type.enum';
import { addMonths } from 'date-fns';
import { Transaction } from '../Transaction/transaction.entity';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class Event {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly amount: number,
    public readonly installments: number,
    public readonly date: Date,
    public readonly type: EventType,
    public readonly categoryId: string,
    public readonly creditCardId?: string,
    public readonly accountId?: string,
    public readonly ownershipType?: OwnershipType,
    public readonly expectedRefundAmount?: number,
    public readonly refundInstallments?: number,
    public readonly refundInstallmentDates?: Date[],
    public readonly isOffBalance?: boolean,
  ) {}

  static create(props: EventProps): Event {
    if (!props.accountId || !props.creditCardId) {
      throw new Error('Account or credit card is required');
    }

    return new Event(
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
    return this.type === EventType.INCOME;
  }

  isExpense(): boolean {
    return this.type === EventType.EXPENSE;
  }

  generateTransactions(): Transaction[] {
    const transactions: Transaction[] = [];

    for (let i = 0; i < this.installments; i++) {
      const dueDate = addMonths(this.date, i);

      const competenceDate = this.date;

      transactions.push(
        Transaction.create({
          amount: this.amount / this.installments,
          dueDate: dueDate,
          competenceDate,
          eventId: this.id,
          status: TransactionStatus.PENDING,
          isRefundable: this.ownershipType === OwnershipType.REFUNDABLE,
          isShared: this.ownershipType === OwnershipType.SHARED,
          notes: this.description,
          accountId: this.accountId,
          creditCardId: this.creditCardId,
        }),
      );
    }

    return transactions;
  }
}

//TODO: criar maneira de fazer refundable e shared
