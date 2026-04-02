import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { IssuedToType } from '@prisma/client';

export class CreateIssuedToDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(IssuedToType)
  @IsOptional()
  type?: IssuedToType;

  @IsString()
  @IsOptional()
  reference?: string;
}

export class UpdateIssuedToDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(IssuedToType)
  @IsOptional()
  type?: IssuedToType;

  @IsString()
  @IsOptional()
  reference?: string;
}
