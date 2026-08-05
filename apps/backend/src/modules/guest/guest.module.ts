import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RoomsModule } from "../rooms/rooms.module";
import { UsersModule } from "../users/users.module";
import { GuestController } from "./guest.controller";
import { GuestService } from "./guest.service";
import { GuestCleanupService } from "./guest-cleanup.service";

@Module({
  imports: [AuthModule, RoomsModule, UsersModule],
  controllers: [GuestController],
  providers: [GuestService, GuestCleanupService],
})
export class GuestModule {}
