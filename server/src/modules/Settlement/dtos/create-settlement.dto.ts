import {
  IsString,
  IsNumber,
  IsDate,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';

export class CreateSettlementDto {
  @IsString()
  transactionId: string;

  @IsString()
  negotiatorId: string;

  @IsNumber()
  amount: number;

  @IsDate()
  dueDate: Date;

  @IsEnum(SettlementStatus)
  status: SettlementStatus;

  @IsEnum(SettlementDirection)
  direction: SettlementDirection;

  @IsOptional()
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
