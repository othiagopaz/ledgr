import { Module, forwardRef } from '@nestjs/common';
import { EventService } from './services/event.service';
import { EventController } from './controllers/event.controller';
import { EventRepository } from './infra/event.repository';
import { EventEntity } from './infra/event.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from '../Transaction/transaction.module';
import { CategoryModule } from '../Category/category.module';
import { EventMapper } from './infra/event.mapper';
import { EVENT_REPOSITORY } from './infra/event.repository';
import { AccountModule } from '../Account/account.module';
import { SettlementModule } from '../Settlement/settlement.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    forwardRef(() => TransactionModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => AccountModule),
    forwardRef(() => SettlementModule),
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
  exports: [EventService, EVENT_REPOSITORY, EventMapper],
})
export class EventModule {}
