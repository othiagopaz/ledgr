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
import { EventType } from '../../../common/enums/event-type.enum';
import { OwnershipType } from '../../../common/enums/ownership-type.enum';

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
  date: string;

  @IsEnum(EventType)
  @IsNotEmpty()
  type: EventType;

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
  @IsNotEmpty()
  ownershipType: OwnershipType;

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
  @IsNotEmpty()
  isOffBalance: boolean;
}
