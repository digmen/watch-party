import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateRoomDto } from "./dto/room.dto";
import { toRoomDto } from "./room.presenter";
import { RoomsService } from "./rooms.service";

@Controller("rooms")
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  async create(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    const room = await this.rooms.create(user.sub, dto.name);
    const members = await this.rooms.listMembers(room.id);
    return { room: toRoomDto(room, members) };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const myRooms = await this.rooms.listForUser(user.sub);
    const withMembers = await Promise.all(
      myRooms.map(async (room) => toRoomDto(room, await this.rooms.listMembers(room.id))),
    );
    return { rooms: withMembers };
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const room = await this.rooms.findById(id);
    if (!(await this.rooms.isMember(id, user.sub))) throw new ForbiddenException("Not a member of this room");
    const members = await this.rooms.listMembers(id);
    return { room: toRoomDto(room, members) };
  }

  @Post(":id/join")
  @HttpCode(200)
  async join(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.rooms.join(id, user.sub);
    const room = await this.rooms.findById(id);
    const members = await this.rooms.listMembers(id);
    return { room: toRoomDto(room, members) };
  }

  @Post(":id/leave")
  @HttpCode(200)
  async leave(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.rooms.leave(id, user.sub);
    return { ok: true };
  }
}
