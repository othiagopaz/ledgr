import { Module } from '@nestjs/common';
import { EventModule } from './modules/Event/event.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from './modules/Transaction/transaction.module';
import { CategoryModule } from './modules/Category/category.module';
import ormConfig from './config/typeorm.config';
import { AccountModule } from './modules/Account/account.module';
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

console.log('DB_HOST via process.env:', process.env.NODE_ENV);
