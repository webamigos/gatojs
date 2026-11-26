/* eslint-disable no-console -- a command-line script: the console is its output */
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

async function main(): Promise<number> {
  const { setupOrganizationsCommand } =
    await import("./lib/setup-organizations");
  const { missingOrganizationSetups, runMissingOrganizationSetups } =
    await import("@/shared/lib/modules/setup");
  const { prisma } = await import("@/shared/lib/prisma");

  try {
    return await setupOrganizationsCommand(process.argv.slice(2), {
      missing: missingOrganizationSetups,
      run: runMissingOrganizationSetups,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
