import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, ArrayNotEmpty } from 'class-validator';

export class ReceiveMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsInt()
  itemId: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  serials: string[];

  @IsInt()
  toLocationId: number;
}

export class TransferMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  serials: string[];

  @IsInt()
  toLocationId: number;
}

export class IssueMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsInt()
  issuedToId: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  serials: string[];
}

export class ReturnMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  serials: string[];

  @IsInt()
  toLocationId: number;
}
