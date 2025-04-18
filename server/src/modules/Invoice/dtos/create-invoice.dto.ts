import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDateString,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';

export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  creditCardId: string;

  @IsNumber()
  @IsNotEmpty()
  referenceMonth: number;

  @IsNumber()
  @IsNotEmpty()
  referenceYear: number;

  @IsDateString()
  @IsNotEmpty()
  closingDate: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsString()
  @IsNotEmpty()
  status: InvoiceStatus;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @IsUUID()
  @IsOptional()
  accountId?: string;
}
