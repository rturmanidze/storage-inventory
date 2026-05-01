import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnitStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUnits, statusCounts, items, recentMovements] = await Promise.all([
      this.prisma.serializedUnit.count(),
      this.prisma.serializedUnit.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.item.findMany({
        where: { minStock: { gt: 0 } },
        include: {
          _count: {
            select: {
              units: { where: { status: UnitStatus.IN_STOCK } },
            },
          },
        },
      }),
      this.prisma.movement.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, username: true, role: true } },
          _count: { select: { lines: true } },
        },
      }),
    ]);

    const statusBreakdown: Record<string, number> = {
      IN_STOCK: 0,
      ISSUED: 0,
      QUARANTINED: 0,
      SCRAPPED: 0,
    };
    for (const row of statusCounts) {
      statusBreakdown[row.status] = row._count.status;
    }

    const lowStockItems = items
      .filter((item) => item._count.units < item.minStock)
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        inStockCount: item._count.units,
        minStock: item.minStock,
      }));

    return {
      totalUnits,
      statusBreakdown,
      lowStockItems,
      recentMovements: recentMovements.map((m) => ({
        id: m.id,
        type: m.type,
        note: m.note,
        createdAt: m.createdAt,
        createdBy: m.createdBy,
        linesCount: m._count.lines,
      })),
    };
  }
}
