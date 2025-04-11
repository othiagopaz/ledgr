import {
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  IsPositive,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../../../core/shared/enums/transaction-status.enum';
import { Ownership } from '../../../core/shared/enums/ownership.enum';
import { TransactionType } from '../../../core/shared/enums/transaction-type.enum';

export class CreateTransactionDto {
  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsInt()
  @IsPositive()
  installmentNumber: number;

  @IsDate()
  @Type(() => Date)
  dueDate: Date;

  @IsDate()
  @Type(() => Date)
  competenceDate: Date;

  @IsString()
  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @IsString()
  @IsEnum(Ownership)
  ownership: Ownership;

  @IsString()
  @IsEnum(TransactionType)
  type: TransactionType;

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
  @IsString()
  notes?: string;
}
