import { v4 as uuidv4 } from 'uuid';
import { EventProps } from './event.types';
import { Transaction } from '../../Transaction/domain/transaction.entity';

export class Event {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly date: Date,
    public readonly categoryId: string,
    public readonly negotiatorId: string,
    public transactions?: Transaction[],
  ) {}

  static create(props: EventProps): Event {
    return new Event(
      uuidv4(),
      props.description,
      props.date,
      props.categoryId,
      props.negotiatorId,
      props.transactions?.map((transaction) => Transaction.create(transaction)),
    );
  }
}
