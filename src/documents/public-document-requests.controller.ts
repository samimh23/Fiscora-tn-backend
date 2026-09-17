import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';

@ApiTags('Public document requests')
@Controller('api/public/document-requests')
export class PublicDocumentRequestsController {
  constructor(private readonly service: DocumentsService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.service.previewPublicExpectation(token);
  }

  @Post(':token/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('token') token: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadPublicExpectation(token, file);
  }
}
