import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5435),
  username: process.env.DB_USER ?? 'accounting',
  password: process.env.DB_PASSWORD ?? 'accounting_dev',
  database: process.env.DB_NAME ?? 'accounting_nest',
  schema: 'public',
  entities: ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
