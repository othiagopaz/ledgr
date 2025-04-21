import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { Transaction } from '../domain/transaction.entity';
export class TransactionResponseDto {
  id: string;
  eventId: string;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  competenceDate: string;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: string;
  accountId?: string;
  creditCardId?: string;
  notes?: string;

  constructor(transaction: Transaction) {
    this.id = transaction.id;
    this.eventId = transaction.eventId;
    this.amount = transaction.amount.toCents();
    this.dueDate = transaction.dueDate.toString();
    this.installmentNumber = transaction.installmentNumber;
    this.competenceDate = transaction.competenceDate.toString();
    this.status = transaction.status;
    this.ownership = transaction.ownership;
    this.type = transaction.type;
    this.paymentDate = transaction.paymentDate?.toString();
    this.accountId = transaction.account?.id;
    this.creditCardId = transaction.creditCard?.id;
    this.notes = transaction.notes;
  }
}
