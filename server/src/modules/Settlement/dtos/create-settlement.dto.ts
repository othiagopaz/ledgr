import {
  IsString,
  IsNumber,
  IsDate,
  IsEnum,
  IsOptional,
  IsInt,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';

export class CreateSettlementDto {
  @IsUUID()
  originalTransactionId: string;

  @IsUUID()
  @IsOptional()
  linkedTransactionId: string;

  @IsUUID()
  negotiatorId: string;

  @IsNumber()
  @IsInt()
  amount: number;

  @IsDate()
  @Type(() => Date)
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
