import type { UserDto } from "@watch-party/shared";
import type { User } from "../../database/schema";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}
