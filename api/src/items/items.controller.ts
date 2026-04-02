import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto, UpdateItemDto, CreateBarcodeDto } from './dto/item.dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.itemsService.findAll(search);
  }

  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Patch(':id')
  patch(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.remove(id);
  }

  @Get(':id/barcodes')
  getBarcodes(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.getBarcodes(id);
  }

  @Post(':id/barcodes')
  addBarcode(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateBarcodeDto) {
    return this.itemsService.addBarcode(id, dto);
  }

  @Delete(':itemId/barcodes/:barcodeId')
  removeBarcode(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('barcodeId', ParseIntPipe) barcodeId: number,
  ) {
    return this.itemsService.removeBarcode(itemId, barcodeId);
  }
}
