import { Controller, Get, Param } from '@nestjs/common';
import { ScanService } from './scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get('barcode/:value')
  async findByBarcode(@Param('value') value: string) {
    const items = await this.scanService.findByBarcode(value);
    return { items };
  }

  @Get('serial/:serial')
  async findBySerial(@Param('serial') serial: string) {
    const unit = await this.scanService.findBySerial(serial);
    return {
      serial: unit.serial,
      itemName: unit.item.name,
      sku: unit.item.sku,
      status: unit.status,
      location: unit.currentLocation?.code ?? null,
      warehouse: unit.currentLocation?.warehouse?.name ?? null,
    };
  }
}
