import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  isArchived?: boolean;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  parentCategoryId?: string;
}
