import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { FinancialEntryEntity } from '../modules/financial-entry/entities/financial-entry.orm-entity';
import { InstallmentEntity } from '../modules/installments/entities/installment.orm-entity';
// Importar as entidades compiladas

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [FinancialEntryEntity, InstallmentEntity],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
  migrationsRun: true,
};

export default typeOrmConfig;
export const AppDataSource = new DataSource(typeOrmConfig);
