import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class CreateUnitDto {
  @IsInt()
  itemId: number;

  @IsString()
  @IsNotEmpty()
  serial: string;

  @IsInt()
  @IsOptional()
  currentLocationId?: number;
}
