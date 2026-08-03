import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [AuthModule], // for JwtAuthGuard's JwtService/ConfigService deps
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
