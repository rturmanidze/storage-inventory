import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveLineDto {
  @IsString()
  @IsNotEmpty()
  serial: string;

  @IsInt()
  toLocationId: number;
}

export class ReceiveMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsInt()
  itemId: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

export class TransferLineDto {
  @IsString()
  @IsNotEmpty()
  serial: string;

  @IsInt()
  toLocationId: number;
}

export class TransferMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

export class IssueLineDto {
  @IsString()
  @IsNotEmpty()
  serial: string;
}

export class IssueMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsInt()
  issuedToId: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

export class ReturnLineDto {
  @IsString()
  @IsNotEmpty()
  serial: string;

  @IsInt()
  toLocationId: number;
}

export class ReturnMovementDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];
}
