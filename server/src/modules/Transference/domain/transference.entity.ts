import { Money } from '../../../utils/shared/types/money';
import { PlainDate } from '../../../utils/shared/types/plain-date';
import { TransferenceProps } from './transference.types';
import { v4 as uuidv4 } from 'uuid';

export class Transference {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly amount: Money,
    public readonly date: PlainDate,
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
    public readonly sourceEventId: string,
    public readonly destinationEventId: string,
    public readonly notes?: string,
  ) {}

  static create(props: TransferenceProps): Transference {
    if (
      !props.description ||
      !props.amount ||
      !props.date ||
      !props.sourceAccountId ||
      !props.destinationAccountId ||
      !props.sourceEventId ||
      !props.destinationEventId
    ) {
      throw new Error('Missing required transference properties.');
    }

    const transferenceId = uuidv4();

    const transference = new Transference(
      transferenceId,
      props.description,
      props.amount,
      props.date,
      props.sourceAccountId,
      props.destinationAccountId,
      props.sourceEventId,
      props.destinationEventId,
      props.notes,
    );
    return transference;
  }
}
