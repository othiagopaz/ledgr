import {
  IsOptional,
  IsString,
  IsUUID,
  IsPositive,
  IsEnum,
  IsInt,
  ValidateNested,
  IsArray,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { CreateSettlementDto } from '../../Settlement/dtos/create-settlement.dto';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';

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

  @IsDateString()
  dueDate: string;

  @IsDateString()
  competenceDate: string;

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
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSettlementDto)
  settlements?: CreateSettlementDto[];
}
