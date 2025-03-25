import { InstallmentStatus } from '../../common/enums/installment-status.enum';

export type InstallmentProps = {
  financialEntryId: string;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  status: InstallmentStatus;
  paymentDate?: Date;
  accountId?: string;
  creditCardId?: string;
  isRefundable?: boolean;
  isShared?: boolean;
  notes?: string;
};
