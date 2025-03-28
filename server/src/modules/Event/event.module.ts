import { Module } from '@nestjs/common';
import { EventService } from './services/event.service';
import { EventController } from './controllers/event.controller';
import { EventRepository } from '../../infrastructure/Event/event.repository';
import { EventEntity } from '../../infrastructure/Event/event.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from '../Transaction/transaction.module';
import { EventMapper } from '../../infrastructure/Event/event.mapper';
import { CategoryModule } from '../Category/category.module';
import { EVENT_REPOSITORY } from '../../infrastructure/common/repository.tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TransactionModule,
    CategoryModule,
  ],
  controllers: [EventController],
  providers: [
    EventService,
    {
      provide: EVENT_REPOSITORY,
      useClass: EventRepository,
    },
    EventMapper,
  ],
  exports: [EventService],
})
export class EventModule {}
