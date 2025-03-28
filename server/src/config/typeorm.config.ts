import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { EventEntity } from '../infrastructure/Event/event.orm-entity';
import { TransactionEntity } from '../infrastructure/Transaction/transaction.orm-entity';
import { CategoryEntity } from '../infrastructure/Category/category.orm-entity';
import { AccountEntity } from '../infrastructure/Account/account.orm-entity';
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [EventEntity, TransactionEntity, CategoryEntity, AccountEntity],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
  migrationsRun: true,
};

export default typeOrmConfig;
export const AppDataSource = new DataSource(typeOrmConfig);
