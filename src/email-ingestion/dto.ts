import { IsUUID } from 'class-validator';

export class ClassifyInboundEmailDto {
  @IsUUID()
  dossierId!: string;
}
