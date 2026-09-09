import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

/** Create once per process; callers own the connection lifecycle. */
export function createDatabase(databaseUrl: string): PrismaClient {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
