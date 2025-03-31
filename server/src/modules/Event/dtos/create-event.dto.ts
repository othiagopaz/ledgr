import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { CreateTransactionDto } from '../../Transaction/dtos/create-transaction.dto';
import { Type } from 'class-transformer';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  installments: number;

  @IsDateString()
  @IsNotEmpty()
  competenceDate: string;

  @IsEnum(TransactionType)
  @IsNotEmpty()
  type: TransactionType;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedRefundAmount?: number;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  transactions: CreateTransactionDto[];
}
