import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "./jwt-auth.guard";

// Guests are scoped to the single room they were invited to: they can watch, chat and drive
// playback there, but not create rooms or enumerate anyone else's.
//
// A plain guard rather than a decorator + Reflector on purpose — this codebase has no SetMetadata
// anywhere and JwtAuthGuard is hand-rolled the same way, so this matches how the project already
// works. It has no constructor dependencies, so it needs no provider registration. Ordering is
// safe: Nest runs class-level guards before method-level ones, and every controller using this
// already carries @UseGuards(JwtAuthGuard) at the class level, so `request.user` is populated.
@Injectable()
export class FullAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    if (!request.user) throw new UnauthorizedException("Missing access token");
    if (request.user.isGuest) {
      throw new ForbiddenException("Гостям это недоступно — создайте аккаунт");
    }
    return true;
  }
}
