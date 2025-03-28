import { EventType } from '../../common/enums/event-type.enum';
import { OwnershipType } from '../../common/enums/ownership-type.enum';
export type EventProps = {
  description: string;
  amount: number;
  installments: number;
  date: Date;
  type: EventType;
  categoryId: string;
  creditCardId?: string;
  accountId?: string;
  ownershipType: OwnershipType;
  expectedRefundAmount?: number;
  refundInstallments?: number;
  refundInstallmentDates?: Date[];
  isOffBalance: boolean;
};
