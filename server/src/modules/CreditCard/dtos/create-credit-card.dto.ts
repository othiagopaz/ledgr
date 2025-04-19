import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsUUID,
  IsOptional,
  IsPositive,
  Max,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { CreditCardFlag } from '../../../utils/shared/enums/credit-card-flags.enum';

export class CreateCreditCardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  @Max(31)
  estimatedDaysBeforeDue: number;

  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  @Max(31)
  dueDay: number;

  @IsEnum(CreditCardFlag)
  @IsNotEmpty()
  flag: CreditCardFlag;

  @IsBoolean()
  @IsNotEmpty()
  isArchived: boolean;

  @IsOptional()
  @IsPositive()
  @IsInt()
  limit?: number;

  @IsString()
  @IsOptional()
  institution?: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
