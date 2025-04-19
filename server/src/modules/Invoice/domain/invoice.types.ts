import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { PlainDate } from '../../../utils/shared/types/plain-date';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
import { Transaction } from '../../Transaction/domain/transaction.entity';

export type InvoiceProps = {
  creditCard: CreditCard;
  referenceMonth: number;
  referenceYear: number;
  closingDate: PlainDate;
  dueDate: PlainDate;
  status: InvoiceStatus;
  transactions?: Transaction[];
  paymentDate?: PlainDate;
  accountId?: string;
};
