import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { CreateTransactionDto } from '../../Transaction/dtos/create-transaction.dto';
import { Type } from 'class-transformer';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @Min(1)
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
  @IsNumber()
  expectedRefundAmount?: number;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  transactions: CreateTransactionDto[];
}
