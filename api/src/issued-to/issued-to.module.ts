import { Module } from '@nestjs/common';
import { IssuedToController } from './issued-to.controller';
import { IssuedToService } from './issued-to.service';

@Module({
  controllers: [IssuedToController],
  providers: [IssuedToService],
  exports: [IssuedToService],
})
export class IssuedToModule {}
