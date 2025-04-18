import { v4 as uuidv4 } from 'uuid';
import { TransactionProps } from './transaction.types';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { Money } from '../../../utils/shared/types/money';
import { Event } from '../../Event/domain/event.entity';
import { Account } from '../../Account/domain/account.entity';
import { Settlement } from '../../Settlement/domain/settlement.entity';
import { BadRequestException } from '@nestjs/common';
import { Invoice } from '../../Invoice/domain/invoice.entity';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
export class Transaction {
  constructor(
    public readonly id: string,
    public readonly event: Event,
    public amount: Money,
    public dueDate: Date,
    public competenceDate: Date,
    public installmentNumber: number,
    public status: TransactionStatus,
    public ownership: Ownership,
    public type: TransactionType,
    public paymentDate?: Date,
    public account?: Account,
    public creditCard?: CreditCard,
    public notes?: string,
    public settlements?: Settlement[],
    public invoice?: Invoice,
  ) {}

  static create(props: TransactionProps): Transaction {
    Transaction.validateTransaction(props);

    const transactionAmount = new Money(props.amount);

    if (props.ownership == Ownership.REFUNDABLE) {
      const totalSettlementsAmount =
        props.settlements?.reduce(
          (acc, settlement) => acc.add(new Money(settlement.amount)),
          new Money(0),
        ) ?? new Money(0);

      if (!transactionAmount.equals(totalSettlementsAmount)) {
        throw new BadRequestException(
          'Total settlements amount must be equal to transaction amount',
        );
      }
    }

    const transaction = new Transaction(
      uuidv4(),
      props.event,
      transactionAmount,
      props.dueDate,
      props.competenceDate,
      props.installmentNumber,
      props.status || TransactionStatus.PENDING,
      props.ownership,
      props.type,
      props.paymentDate,
      props.account,
      props.creditCard,
      props.notes,
      [],
    );

    if (props.ownership === Ownership.REFUNDABLE && props.settlements) {
      transaction.settlements = props.settlements.map((settlementData) =>
        Settlement.create({
          ...settlementData,
          originalTransaction: transaction,
        }),
      );
    }

    return transaction;
  }

  private static validateTransaction(props: TransactionProps) {
    if (!props.event) {
      throw new Error('Event is required');
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

    if (!props.account && !props.creditCard) {
      throw new Error('Account or credit card is required');
    }

    if (props.status === TransactionStatus.PAID && !props.paymentDate) {
      throw new Error('Payment date is required');
    }

    if (props.status === TransactionStatus.PENDING && props.paymentDate) {
      throw new Error('Payment date is not allowed for pending transactions');
    }
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
}
