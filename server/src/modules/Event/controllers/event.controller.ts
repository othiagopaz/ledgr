import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { EventService } from '../services/event.service';
import { CreateEventDto } from '../dtos/create-event.dto';
import { Message } from '../../../common/decorators/message.decorator';

@Controller('events')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Post()
  @Message('Event created successfully')
  async create(@Body() dto: CreateEventDto) {
    try {
      const event = await this.service.create(dto);
      return { id: event.id };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @Message('Events fetched successfully')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Message('Event fetched successfully')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
