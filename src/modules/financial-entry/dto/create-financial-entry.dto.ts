import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  IsBoolean,
} from 'class-validator';
import { EntryType } from '@/shared/enums/entry-type.enum';
import { OwnershipType } from '@/shared/enums/ownership-type.enum';

export class CreateFinancialEntryDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNumber()
  @Min(1)
  installments: number;

  @IsDateString()
  date: string;

  @IsEnum(EntryType)
  type: EntryType;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsString()
  creditCardId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsEnum(OwnershipType)
  ownershipType?: OwnershipType;

  @IsOptional()
  @IsNumber()
  expectedRefundAmount?: number;

  @IsOptional()
  @IsNumber()
  refundInstallments?: number;

  @IsOptional()
  @IsDateString()
  refundInstallmentDates?: string[];

  @IsOptional()
  @IsBoolean()
  isOffBalance?: boolean;
}
