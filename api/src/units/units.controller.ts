import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/unit.dto';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

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
