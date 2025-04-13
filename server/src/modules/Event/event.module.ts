import { Module } from '@nestjs/common';
import { EventService } from './services/event.service';
import { EventController } from './controllers/event.controller';
import { EventRepository } from './infra/event.repository';
import { EventEntity } from './infra/event.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from '../Transaction/transaction.module';
import { CategoryModule } from '../Category/category.module';
import { EVENT_REPOSITORY } from '../../utils/shared/infra/repository.tokens';
import { EventMapper } from './infra/event.mapper';

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
