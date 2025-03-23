import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EntryType } from '@/shared/enums/entry-type.enum';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsEnum(EntryType)
  type: EntryType;

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

// Sample JSON for testing controllers:
/*
{
  "name": "Groceries",
  "type": "EXPENSE",
  "color": "#FF5733",
  "isDefault": false,
  "isArchived": false,
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "parentCategoryId": "987fcdeb-51a2-43f7-9abc-def012345678"
}

// Minimal required fields:
{
  "name": "Salary",
  "type": "INCOME"
}

// With optional fields:
{
  "name": "Shopping",
  "type": "EXPENSE",
  "color": "#33FF57",
  "isDefault": true
}
*/
