import { Controller, Get, Post, Body, Param, Query, Request, ParseIntPipe } from '@nestjs/common';
import { MovementsService } from './movements.service';
import {
  ReceiveMovementDto,
  TransferMovementDto,
  IssueMovementDto,
  ReturnMovementDto,
} from './dto/movement.dto';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Post('receive')
  receive(@Body() dto: ReceiveMovementDto, @Request() req) {
    return this.movementsService.receive(dto, req.user.id);
  }

  @Post('transfer')
  transfer(@Body() dto: TransferMovementDto, @Request() req) {
    return this.movementsService.transfer(dto, req.user.id);
  }

  @Post('issue')
  issue(@Body() dto: IssueMovementDto, @Request() req) {
    return this.movementsService.issue(dto, req.user.id);
  }

  @Post('return')
  return(@Body() dto: ReturnMovementDto, @Request() req) {
    return this.movementsService.return(dto, req.user.id);
  }

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
  ) {
    return this.movementsService.findAll(from, to, type);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.movementsService.findOne(id);
  }
}
