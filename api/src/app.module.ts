import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { LocationsModule } from './locations/locations.module';
import { ItemsModule } from './items/items.module';
import { UnitsModule } from './units/units.module';
import { IssuedToModule } from './issued-to/issued-to.module';
import { ScanModule } from './scan/scan.module';
import { MovementsModule } from './movements/movements.module';
import { ImportModule } from './import/import.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WarehousesModule,
    LocationsModule,
    ItemsModule,
    UnitsModule,
    IssuedToModule,
    ScanModule,
    MovementsModule,
    ImportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
