import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} `);
    return /^(t|tak|y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      "org-name": { type: "string" },
      yes: { type: "boolean", default: false },
    },
  });

  const email = values.email ?? process.env.ADMIN_EMAIL;
  if (!email) {
    console.error("Podaj --email albo ustaw ADMIN_EMAIL");
    process.exit(1);
  }

  const { adminCreate } = await import("./lib/admin-create");
  const { prisma } = await import("@/shared/lib/prisma");

  try {
    const result = await adminCreate({
      email,
      password: values.password ?? process.env.ADMIN_PASSWORD,
      name: values.name,
      orgName: values["org-name"],
      yes: values.yes,
      confirm,
    });
    console.log(
      result.createdUser
        ? `Utworzono administratora ${email}`
        : `Administrator ${email} gotowy`,
    );
    console.log(
      result.createdOrganization
        ? `Utworzono organizację ${result.organizationId}`
        : `Organizacja ${result.organizationId}`,
    );
    if (result.generatedPassword) {
      console.log(
        `Wygenerowane hasło (pokazane raz): ${result.generatedPassword}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
