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
import { Message } from '../../shared/decorators/message.decorator';
import { EventResponseDto } from '../dtos/event-response.dto';

@Controller('events')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Post()
  @Message('Event created successfully')
  async create(@Body() dto: CreateEventDto) {
    try {
      const event = await this.service.create(dto);
      return new EventResponseDto(event);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @Message('Events fetched successfully')
  async findAll() {
    const events = await this.service.findAll();
    return events.map((event) => new EventResponseDto(event));
  }

  @Get(':id')
  @Message('Event fetched successfully')
  async findById(@Param('id') id: string) {
    const event = await this.service.findById(id);
    return new EventResponseDto(event);
  }
}
