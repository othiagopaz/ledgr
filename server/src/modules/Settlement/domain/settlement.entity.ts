import { Money } from '../../../utils/shared/types/money';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement-direction.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { v4 as uuidv4 } from 'uuid';
import { SettlementProps } from './settlement.types';
import { PlainDate } from '../../../utils/shared/types/plain-date';

export class Settlement {
  constructor(
    public readonly id: string,
    public readonly originalTransaction: Transaction,
    public readonly negotiatorId: string,
    public readonly amount: Money,
    public readonly dueDate: PlainDate,
    public readonly status: SettlementStatus,
    public readonly direction: SettlementDirection,
    public readonly linkedTransaction?: Transaction,
    public readonly paymentDate?: PlainDate,
    public readonly accountId?: string,
    public readonly notes?: string,
  ) {}

  static create(props: SettlementProps): Settlement {
    if (
      !props.originalTransaction ||
      !props.negotiatorId ||
      props.amount == null ||
      !props.dueDate ||
      !props.status ||
      !props.direction
    ) {
      throw new Error('Missing required properties for settlement creation.');
    }

    if (props.status == SettlementStatus.PAID && !props.paymentDate) {
      throw new Error('Payment date is required for paid settlements.');
    }

    if (props.status != SettlementStatus.PAID && props.paymentDate) {
      throw new Error('Payment date is not allowed for non-paid settlements.');
    }

    return new Settlement(
      uuidv4(),
      props.originalTransaction,
      props.negotiatorId,
      new Money(props.amount),
      props.dueDate,
      props.status,
      props.direction,
      props.linkedTransaction,
      props.paymentDate,
      props.accountId,
      props.notes,
    );
  }
}
