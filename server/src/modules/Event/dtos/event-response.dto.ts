import { Event } from '../domain/event.entity';
import { TransactionResponseDto } from '../../Transaction/dtos/transaction-response.dto';

export class EventResponseDto {
  id: string;
  description: string;
  date: string;
  categoryId: string;
  negotiatorId: string;
  transactions?: TransactionResponseDto[];

  constructor(event: Event) {
    this.id = event.id;
    this.description = event.description;
    this.date = event.date.toISOString().split('T')[0];
    this.negotiatorId = event.negotiatorId;
    this.categoryId = event.categoryId;
    this.transactions = event.transactions?.map(
      (transaction) => new TransactionResponseDto(transaction),
    );
  }
}
