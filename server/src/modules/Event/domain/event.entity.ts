import { v4 as uuidv4 } from 'uuid';
import { EventProps } from './event.types';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { Category } from '../../Category/domain/category.entity';
import { BadRequestException } from '@nestjs/common';
import { PlainDate } from '../../../utils/shared/types/plain-date';

export class Event {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly date: PlainDate,
    public readonly category: Category,
    public readonly negotiatorId?: string,
    public transactions?: Transaction[],
  ) {}

  static create(props: EventProps): Event {
    if (!props.description || !props.date || !props.category) {
      throw new BadRequestException('Missing required event properties.');
    }

    const eventId = uuidv4();

    const event = new Event(
      eventId,
      props.description,
      props.date,
      props.category,
      props.negotiatorId,
      [],
    );

    if (props.transactions && props.transactions.length > 0) {
      event.transactions = props.transactions.map((txData) => {
        if (
          txData.amount == null ||
          txData.dueDate == null ||
          txData.competenceDate == null
        ) {
          throw new BadRequestException(
            'Missing required transaction properties (amount, dueDate, competenceDate).',
          );
        }

        return Transaction.create({
          ...txData,
          event: event,
        });
      });
    } else {
      throw new BadRequestException('Missing transactions');
    }

    return event;
  }
}
