import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssuedToDto, UpdateIssuedToDto } from './dto/issued-to.dto';

@Injectable()
export class IssuedToService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.issuedTo.findMany();
  }

  async findOne(id: number) {
    const issuedTo = await this.prisma.issuedTo.findUnique({ where: { id } });
    if (!issuedTo) throw new NotFoundException(`IssuedTo ${id} not found`);
    return issuedTo;
  }

  create(dto: CreateIssuedToDto) {
    return this.prisma.issuedTo.create({ data: dto });
  }

  async update(id: number, dto: UpdateIssuedToDto) {
    await this.findOne(id);
    return this.prisma.issuedTo.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.issuedTo.delete({ where: { id } });
  }
}
