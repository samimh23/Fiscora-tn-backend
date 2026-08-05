import { IsDateString, IsOptional } from 'class-validator';

export enum MigrationImportKind {
  Accounts = 'accounts',
  Journals = 'journals',
  ThirdParties = 'third-parties',
  OpeningBalances = 'opening-balances',
}

export class MigrationImportOptionsDto {
  @IsOptional()
  @IsDateString()
  openingDate?: string;
}
