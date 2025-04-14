import { Module } from '@nestjs/common';
import { EventService } from './services/event.service';
import { EventController } from './controllers/event.controller';
import { EventRepository } from './infra/event.repository';
import { EventEntity } from './infra/event.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from '../Transaction/transaction.module';
import { CategoryModule } from '../Category/category.module';
import { EventMapper } from './infra/event.mapper';
import { EVENT_REPOSITORY } from './infra/event.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TransactionModule,
    CategoryModule,
  ],
  controllers: [EventController],
  providers: [
    EventService,
    EventMapper,
    {
      provide: EVENT_REPOSITORY,
      useClass: EventRepository,
    },
  ],
  exports: [EventService],
})
export class EventModule {}
