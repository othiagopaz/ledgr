import {
  IsString,
  IsNumber,
  IsDate,
  IsEnum,
  IsOptional,
  IsInt,
} from 'class-validator';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';

export class CreateSettlementDto {
  @IsString()
  transactionId: string;

  @IsString()
  negotiatorId: string;

  @IsNumber()
  @IsInt()
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
