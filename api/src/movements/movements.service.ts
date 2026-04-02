import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReceiveMovementDto,
  TransferMovementDto,
  IssueMovementDto,
  ReturnMovementDto,
} from './dto/movement.dto';
import { MovementType, UnitStatus } from '@prisma/client';

@Injectable()
export class MovementsService {
  constructor(private prisma: PrismaService) {}

  async receive(dto: ReceiveMovementDto, userId: number) {
    const lineData = await Promise.all(
      dto.lines.map(async (line) => {
        let unit = await this.prisma.serializedUnit.findUnique({
          where: { serial: line.serial },
        });
        if (!unit) {
          unit = await this.prisma.serializedUnit.create({
            data: {
              serial: line.serial,
              itemId: dto.itemId,
              status: UnitStatus.IN_STOCK,
              currentLocationId: line.toLocationId,
            },
          });
        } else {
          unit = await this.prisma.serializedUnit.update({
            where: { id: unit.id },
            data: { status: UnitStatus.IN_STOCK, currentLocationId: line.toLocationId },
          });
        }
        return {
          serialUnitId: unit.id,
          toLocationId: line.toLocationId,
        };
      }),
    );

    return this.prisma.movement.create({
      data: {
        type: MovementType.RECEIVE,
        note: dto.note,
        createdById: userId,
        lines: { create: lineData },
      },
      include: { lines: { include: { serialUnit: true, toLocation: true } }, createdBy: true },
    });
  }

  async transfer(dto: TransferMovementDto, userId: number) {
    const lineData = await Promise.all(
      dto.lines.map(async (line) => {
        const unit = await this.prisma.serializedUnit.findUnique({
          where: { serial: line.serial },
        });
        if (!unit) throw new NotFoundException(`Serial ${line.serial} not found`);
        const fromLocationId = unit.currentLocationId;
        await this.prisma.serializedUnit.update({
          where: { id: unit.id },
          data: { currentLocationId: line.toLocationId },
        });
        return {
          serialUnitId: unit.id,
          fromLocationId,
          toLocationId: line.toLocationId,
        };
      }),
    );

    return this.prisma.movement.create({
      data: {
        type: MovementType.TRANSFER,
        note: dto.note,
        createdById: userId,
        lines: { create: lineData },
      },
      include: { lines: { include: { serialUnit: true, fromLocation: true, toLocation: true } }, createdBy: true },
    });
  }

  async issue(dto: IssueMovementDto, userId: number) {
    const lineData = await Promise.all(
      dto.lines.map(async (line) => {
        const unit = await this.prisma.serializedUnit.findUnique({
          where: { serial: line.serial },
        });
        if (!unit) throw new NotFoundException(`Serial ${line.serial} not found`);
        await this.prisma.serializedUnit.update({
          where: { id: unit.id },
          data: { status: UnitStatus.ISSUED, currentLocationId: null },
        });
        return {
          serialUnitId: unit.id,
          issuedToId: dto.issuedToId,
        };
      }),
    );

    return this.prisma.movement.create({
      data: {
        type: MovementType.ISSUE,
        note: dto.note,
        createdById: userId,
        lines: { create: lineData },
      },
      include: { lines: { include: { serialUnit: true, issuedTo: true } }, createdBy: true },
    });
  }

  async return(dto: ReturnMovementDto, userId: number) {
    const lineData = await Promise.all(
      dto.lines.map(async (line) => {
        const unit = await this.prisma.serializedUnit.findUnique({
          where: { serial: line.serial },
        });
        if (!unit) throw new NotFoundException(`Serial ${line.serial} not found`);
        await this.prisma.serializedUnit.update({
          where: { id: unit.id },
          data: { status: UnitStatus.IN_STOCK, currentLocationId: line.toLocationId },
        });
        return {
          serialUnitId: unit.id,
          toLocationId: line.toLocationId,
        };
      }),
    );

    return this.prisma.movement.create({
      data: {
        type: MovementType.RETURN,
        note: dto.note,
        createdById: userId,
        lines: { create: lineData },
      },
      include: { lines: { include: { serialUnit: true, toLocation: true } }, createdBy: true },
    });
  }

  findAll(from?: string, to?: string, type?: string) {
    return this.prisma.movement.findMany({
      where: {
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(type ? { type: type as MovementType } : {}),
      },
      include: {
        createdBy: { select: { id: true, username: true, email: true, role: true } },
        lines: {
          include: {
            serialUnit: { include: { item: true } },
            fromLocation: true,
            toLocation: true,
            issuedTo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, email: true, role: true } },
        lines: {
          include: {
            serialUnit: { include: { item: true } },
            fromLocation: true,
            toLocation: true,
            issuedTo: true,
          },
        },
      },
    });
    if (!movement) throw new NotFoundException(`Movement ${id} not found`);
    return movement;
  }
}
