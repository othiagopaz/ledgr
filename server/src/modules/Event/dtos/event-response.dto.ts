import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { Event } from '../../../domain/Event/event.entity';
import { TransactionResponseDto } from '../../Transaction/dtos/transaction-response.dto';

export class EventResponseDto {
  id: string;
  description: string;
  amount: number;
  installments: number;
  competenceDate: Date;
  type: TransactionType;
  categoryId: string;
  expectedRefundAmount?: number;
  transactions?: TransactionResponseDto[];

  constructor(event: Event) {
    this.id = event.id;
    this.description = event.description;
    this.amount = event.amount.toCents();
    this.installments = event.installments;
    this.competenceDate = event.competenceDate;
    this.type = event.type;
    this.categoryId = event.categoryId;
    this.expectedRefundAmount = event.expectedRefundAmount?.toCents();
    this.transactions = event.transactions?.map(
      (transaction) => new TransactionResponseDto(transaction),
    );
  }
}
