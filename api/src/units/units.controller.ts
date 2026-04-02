import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/unit.dto';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get('search')
  async search(@Query('serial') serial?: string, @Query('sku') sku?: string) {
    const units = await this.unitsService.findAll(serial, sku);
    return units.map((u) => {
      const lastIssuedLine = u.movementLines
        ?.filter((l) => l.issuedTo)
        .sort((a, b) => b.id - a.id)[0];
      return {
        id: u.id,
        serial: u.serial,
        status: u.status,
        itemName: u.item.name,
        sku: u.item.sku,
        locationCode: u.currentLocation?.code ?? null,
        warehouseName: u.currentLocation?.warehouse?.name ?? null,
        issuedTo: lastIssuedLine?.issuedTo?.name ?? null,
      };
    });
  }

  @Get()
  findAll(@Query('serial') serial?: string, @Query('sku') sku?: string) {
    return this.unitsService.findAll(serial, sku);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.unitsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }
}
