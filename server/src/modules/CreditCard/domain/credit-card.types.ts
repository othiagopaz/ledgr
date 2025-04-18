import { Money } from '../../../utils/shared/types/money';
import { CreditCardFlag } from '../../../utils/shared/enums/credit-card-flags.enum';

export type CreditCardProps = {
  name: string;
  closingDay: number;
  dueDay: number;
  flag: CreditCardFlag;
  isArchived: boolean;
  limit: number;
  institution: string;
  userId: string;
};
