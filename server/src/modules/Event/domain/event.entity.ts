import { v4 as uuidv4 } from 'uuid';
import { EventProps } from './event.types';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { Category } from '../../Category/domain/category.entity';

export class Event {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly date: Date,
    public readonly category: Category,
    public readonly negotiatorId: string,
    public transactions?: Transaction[],
  ) {}

  static create(props: EventProps): Event {
    const eventId = uuidv4();

    const transactions = props.transactions?.map((transaction) =>
      Transaction.create({
        ...transaction,
        eventId,
      }),
    );

    return new Event(
      eventId,
      props.description,
      props.date,
      props.category,
      props.negotiatorId,
      transactions,
    );
  }
}
