import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Ownership } from '../../../common/enums/ownership.enum';
import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { Transaction } from '../../../domain/Transaction/transaction.entity';

export class TransactionResponseDto {
  id: string;
  eventId: string;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: Date;
  accountId?: string;
  creditCardId?: string;
  notes?: string;

  constructor(transaction: Transaction) {
    this.id = transaction.id;
    this.eventId = transaction.eventId;
    this.amount = transaction.amount.toCents();
    this.dueDate = transaction.dueDate;
    this.competenceDate = transaction.competenceDate;
    this.status = transaction.status;
    this.ownership = transaction.ownership;
    this.type = transaction.type;
    this.paymentDate = transaction.paymentDate;
    this.accountId = transaction.accountId;
    this.creditCardId = transaction.creditCardId;
    this.notes = transaction.notes;
  }
}
