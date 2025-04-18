import { Module } from '@nestjs/common';
import { EventModule } from './Event/event.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from './Transaction/transaction.module';
import { CategoryModule } from './Category/category.module';
import ormConfig from '../utils/config/typeorm.config';
import { AccountModule } from './Account/account.module';
import { SettlementModule } from './Settlement/settlement.module';
import { CreditCardModule } from './CreditCard/credit-card.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRoot(ormConfig),
    EventModule,
    TransactionModule,
    CategoryModule,
    AccountModule,
    SettlementModule,
    CreditCardModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

console.log('DB_HOST via process.env:', process.env.NODE_ENV);
