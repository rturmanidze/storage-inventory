import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/unit.dto';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  findAll(serial?: string, sku?: string) {
    return this.prisma.serializedUnit.findMany({
      where: {
        ...(serial ? { serial: { contains: serial, mode: 'insensitive' } } : {}),
        ...(sku ? { item: { sku: { contains: sku, mode: 'insensitive' } } } : {}),
      },
      include: {
        item: true,
        currentLocation: { include: { warehouse: true } },
        movementLines: { include: { issuedTo: true } },
      },
    });
  }

  async findOne(id: number) {
    const unit = await this.prisma.serializedUnit.findUnique({
      where: { id },
      include: { item: true, currentLocation: { include: { warehouse: true } } },
    });
    if (!unit) throw new NotFoundException(`Unit ${id} not found`);
    return unit;
  }

  create(dto: CreateUnitDto) {
    return this.prisma.serializedUnit.create({
      data: dto,
      include: { item: true, currentLocation: true },
    });
  }
}
