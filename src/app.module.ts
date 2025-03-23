import { Module } from '@nestjs/common';
import { FinancialEntryModule } from './modules/financial-entry/financial-entry.module';
import { FinancialEntryController } from './modules/financial-entry/controllers/financial-entry.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentModule } from './modules/installments/installment.module';
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
  ],
  controllers: [FinancialEntryController],
  providers: [],
})
export class AppModule {}

console.log('DB_HOST via process.env:', process.env.NODE_ENV);
