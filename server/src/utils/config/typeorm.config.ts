import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { EventEntity } from '../../modules/Event/infra/event.orm-entity';
import { TransactionEntity } from '../../modules/Transaction/infra/transaction.orm-entity';
import { CategoryEntity } from '../../modules/Category/infra/category.orm-entity';
import { AccountEntity } from '../../modules/Account/infra/account.orm-entity';
import { SettlementEntity } from '../../modules/Settlement/infra/settlement.orm-entity';
import { CreditCardEntity } from '../../modules/CreditCard/infra/credit-card.orm-entity';
import { InvoiceEntity } from '../../modules/Invoice/infra/invoice.orm-entity';
import { TransferenceEntity } from '../../modules/Transference/infra/transference.orm-entity';
import { CategoryRelationEntity } from '../../modules/Category/infra/category-relation.orm-entity';
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [
    EventEntity,
    TransactionEntity,
    CategoryEntity,
    AccountEntity,
    SettlementEntity,
    CreditCardEntity,
    InvoiceEntity,
    TransferenceEntity,
    CategoryRelationEntity,
  ],
  migrations: ['dist/utils/database/migrations/*.js'],
  synchronize: false,
  migrationsRun: true,
};

export default typeOrmConfig;
export const AppDataSource = new DataSource(typeOrmConfig);
