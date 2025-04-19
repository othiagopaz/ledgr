import { Money } from '../../../utils/shared/types/money';
import { PlainDate } from '../../../utils/shared/types/plain-date';

export type TransferenceProps = {
  description: string;
  amount: Money;
  date: PlainDate;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceEventId: string;
  destinationEventId: string;
  notes?: string;
};
