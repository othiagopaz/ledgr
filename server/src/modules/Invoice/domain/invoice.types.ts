import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
import { Transaction } from '../../Transaction/domain/transaction.entity';

export type InvoiceProps = {
  creditCard: CreditCard;
  referenceMonth: number;
  referenceYear: number;
  closingDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  transactions?: Transaction[];
  paymentDate?: Date;
  accountId?: string;
};
