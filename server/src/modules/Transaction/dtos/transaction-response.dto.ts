import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Ownership } from '../../../common/enums/ownership.enum';
import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { Transaction } from '../../../domain/Transaction/transaction.entity';

export class TransactionResponseDto {
  id: string;
  eventId: string;
  amount: number;
  dueDate: string;
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
    this.dueDate = transaction.dueDate.toISOString().split('T')[0];
    this.competenceDate = transaction.competenceDate
      .toISOString()
      .split('T')[0];
    this.status = transaction.status;
    this.ownership = transaction.ownership;
    this.type = transaction.type;
    this.paymentDate = transaction.paymentDate?.toISOString().split('T')[0];
    this.accountId = transaction.accountId;
    this.creditCardId = transaction.creditCardId;
    this.notes = transaction.notes;
  }
}
