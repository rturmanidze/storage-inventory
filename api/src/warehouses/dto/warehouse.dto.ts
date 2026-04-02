import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateWarehouseDto {
  @IsString()
  @IsOptional()
  name?: string;
}
