import { PartialType } from '@nestjs/mapped-types';
import { CreateTransferenceDto } from './create-transference.dto';

export class UpdateTransferenceDto extends PartialType(CreateTransferenceDto) {}
