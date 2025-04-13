import { Money } from '../../../utils/shared/types/money';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';

export class Settlement {
  constructor(
    public readonly id: string,
    public readonly transactionId: string,
    public readonly negotiatorId: string,
    public readonly amount: Money,
    public readonly dueDate: Date,
    public readonly status: SettlementStatus,
    public readonly direction: SettlementDirection,
    public readonly paymentDate?: Date,
    public readonly accountId?: string,
    public readonly notes?: string,
  ) {}
}
