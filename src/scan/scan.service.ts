import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScanService {
  constructor(private prisma: PrismaService) {}

  async findByBarcode(value: string) {
    const barcodes = await this.prisma.itemBarcode.findMany({
      where: { value },
      include: { item: { include: { barcodes: true } } },
    });
    return barcodes.map((b) => b.item);
  }

  async findBySerial(serial: string) {
    const unit = await this.prisma.serializedUnit.findUnique({
      where: { serial },
      include: {
        item: { include: { barcodes: true } },
        currentLocation: { include: { warehouse: true } },
      },
    });
    if (!unit) throw new NotFoundException(`Serial ${serial} not found`);
    return unit;
  }
}
