import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { AccountType } from '../../../core/shared/enums/account-type.enum';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsNumber()
  initialBalance: number;

  @IsString()
  @IsOptional()
  institution?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
