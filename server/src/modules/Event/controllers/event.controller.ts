import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { EventService } from '../services/event.service';
import { CreateEventDto } from '../dtos/create-event.dto';
import { Message } from '../../../utils/shared/decorators/message.decorator';
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

  @Get(':id')
  @Message('Event fetched successfully')
  async findById(@Param('id') id: string) {
    const event = await this.service.findById(id);
    return new EventResponseDto(event);
  }

  @Get('')
  @Message('Events fetched successfully')
  async findWithPagination(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!page) {
      page = 1;
    }
    if (!limit) {
      limit = 10;
    }
    if (!from) {
      from = new Date().toISOString();
    }
    if (!to) {
      to = new Date().toISOString();
    }

    const result = await this.service.findWithPagination(page, limit, from, to);
    return {
      data: result.data.map((event) => new EventResponseDto(event)),
      total: result.total,
    };
  }
}
