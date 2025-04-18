import { v4 as uuidv4 } from 'uuid';
import { CreditCardProps } from './credit-card.types';
import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { CreditCardFlag } from '../../../utils/shared/enums/credit-card-flags.enum';

export class CreditCard {
  constructor(
    public readonly id: string,
    public name: string,
    public closingDay: number,
    public dueDay: number,
    public flag: CreditCardFlag,
    public isArchived: boolean,
    public limit?: Money,
    public institution?: string,
    public userId?: string,
  ) {}

  static create(props: CreditCardProps): CreditCard {
    if (
      !props.name ||
      !props.closingDay ||
      !props.dueDay ||
      !props.flag ||
      !props.limit ||
      !props.institution ||
      !props.userId
    ) {
      throw new BadRequestException('Missing required event properties.');
    }

    const creditCardId = uuidv4();

    const creditCard = new CreditCard(
      creditCardId,
      props.name,
      props.closingDay,
      props.dueDay,
      props.flag,
      props.isArchived,
      new Money(props.limit),
      props.institution,
      props.userId,
    );

    return creditCard;
  }
}
