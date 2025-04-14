import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from './create-event.dto';
import { IsNotEmpty } from 'class-validator';
import { IsUUID } from 'class-validator';
import { IsString } from 'class-validator';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;
}
