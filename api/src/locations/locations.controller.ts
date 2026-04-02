import { Controller, Get, Post, Put, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('warehouses/:warehouseId/locations')
  findByWarehouse(@Param('warehouseId', ParseIntPipe) warehouseId: number) {
    return this.locationsService.findByWarehouse(warehouseId);
  }

  @Post('warehouses/:warehouseId/locations')
  create(
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.create(warehouseId, dto);
  }

  @Get('locations/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.findOne(id);
  }

  @Put('locations/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto);
  }

  @Patch('warehouses/:warehouseId/locations/:id')
  patch(
    @Param('warehouseId', ParseIntPipe) _warehouseId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, dto);
  }

  @Delete('locations/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.remove(id);
  }
}
