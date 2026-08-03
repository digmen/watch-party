import { AddVideoSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class AddVideoDto extends createZodDto(AddVideoSchema) {}
