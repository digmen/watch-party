import { GuestJoinSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class GuestJoinDto extends createZodDto(GuestJoinSchema) {}
