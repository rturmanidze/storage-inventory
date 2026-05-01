import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';

@Controller('import')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('items')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importItems(@UploadedFile() file: Express.Multer.File) {
    return this.importService.importItems(file);
  }

  @Post('locations')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importLocations(@UploadedFile() file: Express.Multer.File) {
    return this.importService.importLocations(file);
  }

  @Post('barcodes')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importBarcodes(@UploadedFile() file: Express.Multer.File) {
    return this.importService.importBarcodes(file);
  }

  @Post('units')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importUnits(@UploadedFile() file: Express.Multer.File) {
    return this.importService.importUnits(file);
  }

  @Post('placements')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importPlacements(@UploadedFile() file: Express.Multer.File) {
    return this.importService.importPlacements(file);
  }
}
