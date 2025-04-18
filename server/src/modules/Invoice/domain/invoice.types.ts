import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';

export type InvoiceProps = {
  creditCardId: string;
  referenceMonth: number;
  referenceYear: number;
  closingDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  transactions?: Transaction[];
  paymentDate?: Date;
  accountId?: string;
};
