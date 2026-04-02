import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;
}

export class UpdateItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;
}

export class CreateBarcodeDto {
  @IsString()
  @IsNotEmpty()
  value: string;

  @IsString()
  @IsOptional()
  symbology?: string;
}
