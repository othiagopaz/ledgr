import { v4 as uuidv4 } from 'uuid';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { EventProps } from './event.types';
import { Transaction } from '../Transaction/transaction.entity';
import { TransactionProps } from '../Transaction/transaction.types';
import { Ownership } from '../../common/enums/ownership.enum';
import { Money } from '../../common/types/money';

export class Event {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly amount: Money,
    public readonly installments: number,
    public readonly competenceDate: Date,
    public readonly type: TransactionType,
    public readonly categoryId: string,
    public readonly expectedRefundAmount?: Money,
    public transactions?: Transaction[],
  ) {}

  static create(props: EventProps): Event {
    if (props.transactions) {
      Event.validateTransactions(props.transactions);
    }
    return new Event(
      uuidv4(),
      props.description,
      new Money(props.amount),
      props.installments,
      props.competenceDate,
      props.type,
      props.categoryId,
      props.expectedRefundAmount
        ? new Money(props.expectedRefundAmount)
        : undefined,
    );
  }

  static validateTransactions(transactions: TransactionProps[]): void {
    const refundableTransactions = transactions.filter(
      (transaction) => transaction.ownership === Ownership.REFUNDABLE,
    );
    if (refundableTransactions.length > 0) {
      const refundableSum = refundableTransactions.reduce(
        (sum, transaction) => {
          const amount = new Money(transaction.amount);
          return transaction.type === TransactionType.INCOME
            ? sum.add(amount)
            : sum.subtract(amount);
        },
        Money.zero(),
      );

      if (!refundableSum.isZero()) {
        throw new Error('Refundable transactions must sum to zero');
      }
    }
  }
}
