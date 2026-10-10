import { ReorderQueueSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class ReorderQueueDto extends createZodDto(ReorderQueueSchema) {}
