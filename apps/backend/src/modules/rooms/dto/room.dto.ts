import { CreateRoomSchema, JoinRoomSchema, UpdateRoomSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class CreateRoomDto extends createZodDto(CreateRoomSchema) {}

export class UpdateRoomDto extends createZodDto(UpdateRoomSchema) {}
export class JoinRoomDto extends createZodDto(JoinRoomSchema) {}
