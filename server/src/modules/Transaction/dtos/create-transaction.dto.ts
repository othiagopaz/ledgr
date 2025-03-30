import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsPositive,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Ownership } from '../../../common/enums/ownership.enum';
import { TransactionType } from '../../../common/enums/transaction-type.enum';

export class CreateTransactionDto {
  @IsUUID()
  @IsOptional()
  eventId?: string;

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
