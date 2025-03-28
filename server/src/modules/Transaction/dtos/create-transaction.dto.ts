import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';

export class CreateTransactionDto {
  @IsUUID()
  eventId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDate()
  @Type(() => Date)
  dueDate: Date;

  @IsDate()
  @Type(() => Date)
  competenceDate: Date;

  @IsString()
  status: TransactionStatus;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  paymentDate?: Date;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsBoolean()
  isRefundable?: boolean;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
