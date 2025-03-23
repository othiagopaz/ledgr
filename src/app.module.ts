import { Module } from '@nestjs/common';
import { FinancialEntryModule } from './modules/financial-entry/financial-entry.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentModule } from './modules/installment/installment.module';
import { CategoryModule } from './modules/category/category.module';
import ormConfig from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRoot(ormConfig),
    FinancialEntryModule,
    InstallmentModule,
    CategoryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

console.log('DB_HOST via process.env:', process.env.NODE_ENV);
