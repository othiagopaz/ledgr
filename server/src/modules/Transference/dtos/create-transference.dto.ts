import { IsString, IsNumber, IsUUID, IsOptional } from 'class-validator';

export class CreateTransferenceDto {
  @IsString()
  description: string;

  @IsNumber()
  amount: number;

  @IsString()
  date: string;

  @IsUUID()
  sourceAccountId: string;

  @IsUUID()
  destinationAccountId: string;

  @IsUUID()
  sourceEventId: string;

  @IsUUID()
  destinationEventId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
