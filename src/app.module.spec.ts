import { type DynamicModule, type FactoryProvider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppModule } from './app.module';
import { SyncControlledFiscalYearClosings1790726400000 } from './database/migrations/1790726400000-sync-controlled-fiscal-year-closings';
import { WorkflowIntegrity1790784000000 } from './database/migrations/1790784000000-workflow-integrity';
import { EmailIngestion1784384000000 } from './database/migrations/1784384000000-email-ingestion';
import { EmailIngestionModule } from './email-ingestion/email-ingestion.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { OrganizationsModule } from './organizations/organizations.module';

describe('Runtime migration registration', () => {
  it.each(['true', 'false'])(
    'registers the controlled closure repair with startup migrations=%s',
    async (enabled) => {
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        AppModule,
      ) as DynamicModule[];
      const typeOrm = imports.find((entry) => entry.module === TypeOrmModule);
      expect(typeOrm).toBeDefined();
      const core = typeOrm!.imports![0] as DynamicModule;
      const optionsProvider = core.providers!.find(
        (provider) =>
          typeof provider === 'object' &&
          'provide' in provider &&
          provider.provide === 'TypeOrmModuleOptions',
      ) as FactoryProvider<TypeOrmModuleOptions>;
      const config = {
        get: (key: string, fallback: unknown) =>
          key === 'DB_MIGRATIONS_RUN' ? enabled : fallback,
      } as ConfigService;
      const options = await optionsProvider.useFactory(config);
      expect(options.migrations).toContain(
        SyncControlledFiscalYearClosings1790726400000,
      );
      expect(options.migrations).toContain(WorkflowIntegrity1790784000000);
      expect(options.migrations).toContain(EmailIngestion1784384000000);
      expect(options.migrationsRun).toBe(enabled === 'true');
      expect(options.synchronize).toBe(false);
    },
  );
});

describe('Document collection runtime', () => {
  it('does not activate inbound email but retains uploads and account emails', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];
    expect(imports).not.toContain(EmailIngestionModule);
    expect(imports).toContain(AuthModule);
    expect(imports).toContain(DocumentsModule);
    expect(imports).toContain(OrganizationsModule);
  });
});
