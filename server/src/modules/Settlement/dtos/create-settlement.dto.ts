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
import { SettlementDirection } from '../../../utils/shared/enums/settlement-direction.enum';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';

export class CreateSettlementDto {
  @IsUUID()
  @IsOptional()
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

  @IsString()
  accountId: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  paymentDate?: Date;

  @IsOptional()
  @IsString()
  notes?: string;
}
