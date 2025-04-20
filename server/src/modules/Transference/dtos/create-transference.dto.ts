import {
  IsString,
  IsNumber,
  IsUUID,
  IsOptional,
  IsPositive,
  IsInt,
} from 'class-validator';

export class CreateTransferenceDto {
  @IsNumber()
  @IsPositive()
  @IsInt()
  amount: number;

  @IsString()
  date: string;

  @IsUUID()
  sourceAccountId: string;

  @IsUUID()
  destinationAccountId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
