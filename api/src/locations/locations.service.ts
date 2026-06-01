import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  findByWarehouse(warehouseId: number) {
    return this.prisma.location.findMany({ where: { warehouseId } });
  }

  async findOne(id: number) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { warehouse: true },
    });
    if (!location) throw new NotFoundException(`Location ${id} not found`);
    return location;
  }

  create(warehouseId: number, dto: CreateLocationDto) {
    return this.prisma.location.create({
      data: { ...dto, warehouseId },
    });
  }

  async update(id: number, dto: UpdateLocationDto) {
    await this.findOne(id);
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.location.delete({ where: { id } });
  }
}
