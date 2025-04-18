import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  IsHexColor,
} from 'class-validator';
import { AccountType } from '../../../utils/shared/enums/account-type.enum';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsInt()
  @IsNumber()
  initialBalance: number;

  @IsBoolean()
  isDefault: boolean;

  @IsString()
  @IsOptional()
  institution?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
