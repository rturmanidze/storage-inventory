import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';

export interface ImportResult {
  success: number;
  errors: { row: number; message: string }[];
}

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  private async parseFile(file: Express.Multer.File): Promise<any[]> {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      return parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const workbook = new ExcelJS.Workbook();
      // ExcelJS Buffer type is incompatible with Node's Buffer<ArrayBufferLike> in newer TypeScript versions
      await workbook.xlsx.load(file.buffer as any);
      const worksheet = workbook.worksheets[0];
      const rows: any[] = [];
      let headers: string[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          headers = (row.values as any[]).slice(1).map(String);
        } else {
          const obj: any = {};
          (row.values as any[]).slice(1).forEach((val, idx) => {
            obj[headers[idx]] = val !== undefined && val !== null ? String(val) : '';
          });
          rows.push(obj);
        }
      });
      return rows;
    }
    throw new BadRequestException('Unsupported file format. Use CSV or XLSX.');
  }

  async importItems(file: Express.Multer.File): Promise<ImportResult> {
    const rows = await this.parseFile(file);
    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (!row.sku || !row.name) {
          errors.push({ row: rowNum, message: 'Missing required fields: sku, name' });
          continue;
        }
        await this.prisma.item.upsert({
          where: { sku: row.sku },
          update: {
            name: row.name,
            category: row.category || null,
            unit: row.unit || 'pcs',
            minStock: row.minStock ? parseInt(row.minStock) : 0,
          },
          create: {
            sku: row.sku,
            name: row.name,
            category: row.category || null,
            unit: row.unit || 'pcs',
            minStock: row.minStock ? parseInt(row.minStock) : 0,
          },
        });
        success++;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message });
      }
    }
    return { success, errors };
  }

  async importLocations(file: Express.Multer.File): Promise<ImportResult> {
    const rows = await this.parseFile(file);
    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (!row.code || (!row.warehouseId && !row.warehouseName)) {
          errors.push({ row: rowNum, message: 'Missing required fields: code, warehouseId or warehouseName' });
          continue;
        }
        let warehouseId = row.warehouseId ? parseInt(row.warehouseId) : undefined;
        if (!warehouseId && row.warehouseName) {
          const wh = await this.prisma.warehouse.findFirst({ where: { name: row.warehouseName } });
          if (!wh) {
            errors.push({ row: rowNum, message: `Warehouse "${row.warehouseName}" not found` });
            continue;
          }
          warehouseId = wh.id;
        }
        await this.prisma.location.upsert({
          where: { warehouseId_code: { warehouseId, code: row.code } },
          update: { description: row.description || null },
          create: { warehouseId, code: row.code, description: row.description || null },
        });
        success++;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message });
      }
    }
    return { success, errors };
  }

  async importBarcodes(file: Express.Multer.File): Promise<ImportResult> {
    const rows = await this.parseFile(file);
    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (!row.sku || !row.barcode) {
          errors.push({ row: rowNum, message: 'Missing required fields: sku, barcode' });
          continue;
        }
        const item = await this.prisma.item.findUnique({ where: { sku: row.sku } });
        if (!item) {
          errors.push({ row: rowNum, message: `Item with sku "${row.sku}" not found` });
          continue;
        }
        const existing = await this.prisma.itemBarcode.findFirst({
          where: { itemId: item.id, value: row.barcode },
        });
        if (!existing) {
          await this.prisma.itemBarcode.create({ data: { itemId: item.id, value: row.barcode } });
        }
        success++;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message });
      }
    }
    return { success, errors };
  }

  async importUnits(file: Express.Multer.File): Promise<ImportResult> {
    const rows = await this.parseFile(file);
    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (!row.sku || !row.serial) {
          errors.push({ row: rowNum, message: 'Missing required fields: sku, serial' });
          continue;
        }
        const item = await this.prisma.item.findUnique({ where: { sku: row.sku } });
        if (!item) {
          errors.push({ row: rowNum, message: `Item with sku "${row.sku}" not found` });
          continue;
        }
        await this.prisma.serializedUnit.upsert({
          where: { serial: row.serial },
          update: {},
          create: { serial: row.serial, itemId: item.id },
        });
        success++;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message });
      }
    }
    return { success, errors };
  }

  async importPlacements(file: Express.Multer.File): Promise<ImportResult> {
    const rows = await this.parseFile(file);
    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (!row.serial || !row.locationCode || (!row.warehouseId && !row.warehouseName)) {
          errors.push({ row: rowNum, message: 'Missing required fields: serial, locationCode, warehouseId or warehouseName' });
          continue;
        }
        let warehouseId = row.warehouseId ? parseInt(row.warehouseId) : undefined;
        if (!warehouseId && row.warehouseName) {
          const wh = await this.prisma.warehouse.findFirst({ where: { name: row.warehouseName } });
          if (!wh) {
            errors.push({ row: rowNum, message: `Warehouse "${row.warehouseName}" not found` });
            continue;
          }
          warehouseId = wh.id;
        }
        const location = await this.prisma.location.findUnique({
          where: { warehouseId_code: { warehouseId, code: row.locationCode } },
        });
        if (!location) {
          errors.push({ row: rowNum, message: `Location "${row.locationCode}" not found in warehouse` });
          continue;
        }
        const unit = await this.prisma.serializedUnit.findUnique({ where: { serial: row.serial } });
        if (!unit) {
          errors.push({ row: rowNum, message: `Serial "${row.serial}" not found` });
          continue;
        }
        await this.prisma.serializedUnit.update({
          where: { id: unit.id },
          data: { currentLocationId: location.id },
        });
        success++;
      } catch (e) {
        errors.push({ row: rowNum, message: e.message });
      }
    }
    return { success, errors };
  }
}
