import { CreateRoomSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class CreateRoomDto extends createZodDto(CreateRoomSchema) {}
