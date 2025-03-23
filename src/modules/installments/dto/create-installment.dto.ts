import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InstallmentStatus } from '../../../shared/enums/installment-status.enum';

export class CreateInstallmentDto {
  @IsUUID()
  financialEntryId: string;

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
  status: InstallmentStatus;

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
  @IsBoolean()
  isRefundable?: boolean;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
