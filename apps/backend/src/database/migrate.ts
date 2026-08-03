import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: "./src/database/migrations" });
  await sql.end();
}

main()
  .then(() => {
    console.log("Migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
