import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FinancialEntryModule } from './modules/financial-entry/financial-entry.module';
import { FinancialEntryController } from './modules/financial-entry/controllers/financial-entry.controller';
// import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    // TypeOrmModule.forRoot({
    //   type: 'postgres',
    //   host: 'localhost',
    //   port: 5432,
    //   username: 'seu_usuario',
    //   password: 'sua_senha',
    //   database: 'ledger',
    //   autoLoadEntities: true, // <- carrega os @Entity() automaticamente
    //   synchronize: true, // <- true no dev, false em prod
    // }),
    FinancialEntryModule,
  ],
  controllers: [AppController, FinancialEntryController],
  providers: [AppService],
})
export class AppModule {}
