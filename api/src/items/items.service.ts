import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto, UpdateItemDto, CreateBarcodeDto } from './dto/item.dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.item.findMany({
      where: search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { barcodes: true },
    });
  }

  async findOne(id: number) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { barcodes: true },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  create(dto: CreateItemDto) {
    return this.prisma.item.create({ data: dto, include: { barcodes: true } });
  }

  async update(id: number, dto: UpdateItemDto) {
    await this.findOne(id);
    return this.prisma.item.update({ where: { id }, data: dto, include: { barcodes: true } });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.item.delete({ where: { id } });
  }

  getBarcodes(itemId: number) {
    return this.prisma.itemBarcode.findMany({ where: { itemId } });
  }

  addBarcode(itemId: number, dto: CreateBarcodeDto) {
    return this.prisma.itemBarcode.create({ data: { itemId, value: dto.value } });
  }

  async removeBarcode(itemId: number, barcodeId: number) {
    const barcode = await this.prisma.itemBarcode.findFirst({
      where: { id: barcodeId, itemId },
    });
    if (!barcode) throw new NotFoundException(`Barcode ${barcodeId} not found`);
    return this.prisma.itemBarcode.delete({ where: { id: barcodeId } });
  }
}
