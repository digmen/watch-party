import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

// Sites change their players weekly and yt-dlp ships a fix within days; a copy frozen into the image
// slowly stops resolving YouTube/TikTok/Twitch. The image carries a self-updatable release in the
// user's PATH (see apps/backend/Dockerfile) and this refreshes it every night — no rebuild, no
// redeploy, and a failed update simply leaves the previous version in place.
@Injectable()
export class YtDlpUpdaterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(YtDlpUpdaterService.name);

  async onApplicationBootstrap(): Promise<void> {
    const version = await this.run(["yt-dlp", "--version"]);
    this.logger.log(`yt-dlp ${version.out.trim() || "not available"}`);
  }

  @Cron("0 10 5 * * *")
  async updateNightly(): Promise<void> {
    const before = (await this.run(["yt-dlp", "--version"])).out.trim();
    const result = await this.run(["yt-dlp", "-U"]);
    const after = (await this.run(["yt-dlp", "--version"])).out.trim();
    if (before !== after) this.logger.log(`yt-dlp updated ${before} -> ${after}`);
    else this.logger.log(`yt-dlp ${after} is current${result.code === 0 ? "" : " (update check failed)"}`);
  }

  private async run(cmd: string[]): Promise<{ code: number; out: string }> {
    try {
      const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => proc.kill(), 120_000);
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
      clearTimeout(timer);
      return { code, out };
    } catch {
      return { code: -1, out: "" };
    }
  }
}
