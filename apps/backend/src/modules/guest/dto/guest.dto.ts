import { GuestJoinSchema, GuestStartSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class GuestJoinDto extends createZodDto(GuestJoinSchema) {}

export class GuestStartDto extends createZodDto(GuestStartSchema) {}
