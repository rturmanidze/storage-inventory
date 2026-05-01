import { Controller, Get, Param } from '@nestjs/common';
import { ScanService } from './scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get('barcode/:value')
  findByBarcode(@Param('value') value: string) {
    return this.scanService.findByBarcode(value);
  }

  @Get('serial/:serial')
  findBySerial(@Param('serial') serial: string) {
    return this.scanService.findBySerial(serial);
  }
}
