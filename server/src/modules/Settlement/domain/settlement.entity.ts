import { Money } from '../../../utils/shared/types/money';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';

export class Settlement {
  id: string;
  transactionId: string;
  negotiatorId: string;
  amount: Money;
  dueDate: Date;
  status: SettlementStatus;
  direction: SettlementDirection;
  paymentDate?: Date;
  accountId?: string;
  notes?: string;

  constructor(props: {
    id: string;
    transactionId: string;
    negotiatorId: string;
    amount: Money;
    dueDate: Date;
    status: SettlementStatus;
    direction: SettlementDirection;
    paymentDate?: Date;
    accountId?: string;
    notes?: string;
  }) {
    this.id = props.id;
    this.transactionId = props.transactionId;
    this.negotiatorId = props.negotiatorId;
    this.amount = props.amount;
    this.dueDate = props.dueDate;
    this.status = props.status;
    this.direction = props.direction;
    this.paymentDate = props.paymentDate;
    this.accountId = props.accountId;
    this.notes = props.notes;
  }
}
