import { CreditCardFlag } from '../../../utils/shared/enums/credit-card-flags.enum';

export type CreditCardProps = {
  name: string;
  estimatedDaysBeforeDue: number;
  dueDay: number;
  flag: CreditCardFlag;
  isArchived: boolean;
  limit: number;
  institution: string;
  userId: string;
};
