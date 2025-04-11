import { Module } from '@nestjs/common';
import { EventService } from './services/event.service';
import { EventController } from './controllers/event.controller';
import { EventRepository } from './infra/event.repository';
import { EventEntity } from './infra/event.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from '../Transaction/transaction.module';
import { EventMapper } from './infra/event.mapper';
import { CategoryModule } from '../Category/category.module';
import { EVENT_REPOSITORY } from '../shared/infra/repository.tokens';
import { CATEGORY_REPOSITORY } from '../shared/infra/repository.tokens';
import { CategoryRepository } from '../Category/infra/category.repository';
import { CategoryEntity } from '../Category/infra/category.orm-entity';
import { CategoryMapper } from '../Category/infra/category.mapper';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, CategoryEntity]),
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
    {
      provide: CATEGORY_REPOSITORY,
      useClass: CategoryRepository,
    },
    EventMapper,
    CategoryMapper,
  ],
  exports: [EventService],
})
export class EventModule {}
