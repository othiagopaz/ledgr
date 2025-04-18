import { PartialType } from '@nestjs/mapped-types';
import { CreateCreditCardDto } from './create-credit-card.dto';
import { IsUUID } from 'class-validator';
import { IsNotEmpty } from 'class-validator';

export class UpdateCreditCardDto extends PartialType(CreateCreditCardDto) {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}
