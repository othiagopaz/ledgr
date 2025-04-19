import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { TransferenceService } from '../services/transference.service';
import { CreateTransferenceDto } from '../dtos/create-transference.dto';
import { Transference } from '../domain/transference.entity';
import { Message } from '../../../utils/shared/decorators/message.decorator';

@Controller('transferences')
export class TransferenceController {
  constructor(private readonly transferenceService: TransferenceService) {}

  @Post()
  @Message('Transference created successfully')
  async create(@Body() dto: CreateTransferenceDto): Promise<Transference> {
    try {
      return this.transferenceService.create(dto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @Message('Transferences fetched successfully')
  async findAll(): Promise<Transference[]> {
    return this.transferenceService.findAll();
  }

  @Get(':id')
  @Message('Transference fetched successfully')
  async findById(@Param('id') id: string): Promise<Transference> {
    return this.transferenceService.findById(id);
  }
}
