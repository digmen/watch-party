import { LoginSchema, RegisterSchema } from "@watch-party/shared";
import { createZodDto } from "nestjs-zod";

export class RegisterDto extends createZodDto(RegisterSchema) {}
export class LoginDto extends createZodDto(LoginSchema) {}
