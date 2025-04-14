import { Event } from '../domain/event.entity';
import { TransactionResponseDto } from '../../Transaction/dtos/transaction-response.dto';
import { Category } from '../../Category/domain/category.entity';
export class EventResponseDto {
  id: string;
  description: string;
  date: string;
  category: Category;
  negotiatorId: string;
  transactions?: TransactionResponseDto[];

  constructor(event: Event) {
    this.id = event.id;
    this.description = event.description;
    this.date = event.date.toISOString().split('T')[0];
    this.negotiatorId = event.negotiatorId;
    this.category = event.category;
    this.transactions = event.transactions?.map(
      (transaction) => new TransactionResponseDto(transaction),
    );
  }
}
