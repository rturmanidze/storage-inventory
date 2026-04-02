import { Controller, Get, Post, Put, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { IssuedToService } from './issued-to.service';
import { CreateIssuedToDto, UpdateIssuedToDto } from './dto/issued-to.dto';

@Controller('issued-to')
export class IssuedToController {
  constructor(private readonly issuedToService: IssuedToService) {}

  @Get()
  findAll() {
    return this.issuedToService.findAll();
  }

  @Post()
  create(@Body() dto: CreateIssuedToDto) {
    return this.issuedToService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.issuedToService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIssuedToDto) {
    return this.issuedToService.update(id, dto);
  }

  @Patch(':id')
  patch(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIssuedToDto) {
    return this.issuedToService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.issuedToService.remove(id);
  }
}
