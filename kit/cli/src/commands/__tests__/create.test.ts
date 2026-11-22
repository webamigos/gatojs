import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "../../generate/index.js";
import { readKitState } from "../../manifest/kit-state.js";
import type { Prompter, SelectChoice } from "../../process/prompter.js";
import { readlinePrompter } from "../../process/prompter.js";
import type { Runner } from "../../process/runner.js";
import {
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import { create } from "../create.js";
import type { CreateOptions } from "../create.js";

const COMMIT_COMMAND =
  "git commit -q --no-verify -m chore: initial commit from wa-kit v0.1.0";
const SECRET_LINE = /^BETTER_AUTH_SECRET=([A-Za-z0-9_-]{43})$/m;

let kit: string;
let tmp: string;
let logs: string[];
let runner: ReturnType<typeof vi.fn<Runner>>;

function checkedValues(choices: SelectChoice[]): string[] {
  return choices
    .filter((choice) => choice.checked)
    .map((choice) => choice.value);
}

function scriptedPrompter(
  asks: string[],
  confirms: boolean[] = [],
  selects: string[][] = [],
) {
  const questions: {
    question: string;
    fallback?: string | boolean;
    choices?: SelectChoice[];
  }[] = [];
  const selections: { question: string; choices: SelectChoice[] }[] = [];
  const pendingAsks = [...asks];
  const pendingConfirms = [...confirms];
  const pendingSelects = [...selects];
  const prompter: Prompter = {
    select: vi.fn(async (question: string, choices: SelectChoice[]) => {
      questions.push({ question, choices });
      selections.push({ question, choices });
      return pendingSelects.shift() ?? checkedValues(choices);
    }),
    ask: vi.fn(async (question: string, fallback: string) => {
      questions.push({ question, fallback });
      return pendingAsks.shift() ?? fallback;
    }),
    confirm: vi.fn(async (question: string, fallback: boolean) => {
      questions.push({ question, fallback });
      return pendingConfirms.shift() ?? fallback;
    }),
  };
  return { prompter, questions, selections };
}

function opts(overrides: Partial<CreateOptions> = {}): CreateOptions {
  return {
    target: join(tmp, "acme-shop"),
    kitDir: kit,
    modules: [],
    locales: null,
    title: null,
    adminEmail: null,
    yes: false,
    setup: false,
    install: false,
    git: false,
    runner,
    prompter: scriptedPrompter([]).prompter,
    log: (line) => logs.push(line),
    ...overrides,
  };
}

function commands(): string[] {
  return runner.mock.calls.map(([command, args]) =>
    [command, ...args].join(" "),
  );
}

async function read(dir: string, path: string): Promise<string> {
  return readFile(join(dir, path), "utf8");
}

beforeEach(async () => {
  kit = await makeKitRepo("kit");
  tmp = await makeTempDir();
  logs = [];
  runner = vi.fn<Runner>(async () => {});
});

afterEach(async () => {
  await removeTempDirs();
});

describe("create: składanie projektu", () => {
  it.skipIf(process.platform === "win32")(
    "plik .env ma uprawnienia tylko dla właściciela",
    async () => {
      const dir = join(tmp, "acme-shop");
      await create(opts({ target: dir, yes: true }));
      expect((await stat(join(dir, ".env"))).mode & 0o777).toBe(0o600);
    },
  );

  it("składa core + demo bez plików kit-only, z placeholderami i hashami", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, modules: ["demo"], yes: true }));
    expect(existsSync(join(dir, "docs"))).toBe(false);
    expect(existsSync(join(dir, "kit"))).toBe(false);
    expect(await read(dir, "src/shared/config/project.ts")).toContain(
      '"Acme Shop"',
    );
    expect(await read(dir, "src/modules.generated.ts")).toContain(
      "@/features/demo/module",
    );
    expect(await read(dir, ".env.example")).toContain(
      "DEMO_TOKEN=acme-shop_demo_",
    );
    const state = await readKitState(dir);
    expect(Object.keys(state.modules)).toEqual(["core", "demo"]);
    expect(state.modules["demo"]?.files["src/features/demo/module.ts"]).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(JSON.parse(await read(dir, "package.json"))).toMatchObject({
      name: "acme-shop",
      dependencies: { "left-pad": "^1.3.0" },
    });
    expect(await read(dir, ".env")).not.toContain("change-me");
  });

  it("zwraca katalog projektu i listę modułów z zależnościami", async () => {
    const dir = join(tmp, "acme-shop");
    const result = await create(
      opts({ target: dir, modules: ["needs-demo"], yes: true }),
    );
    expect(result).toEqual({
      projectDir: dir,
      modules: ["core", "demo", "needs-demo"],
    });
  });

  it("zapisuje .wa/kit.json z wersją kitu, repo, projektem, językami i pustymi projectModules", async () => {
    const dir = join(tmp, "acme-shop");
    await create(
      opts({ target: dir, modules: ["demo"], locales: ["pl"], yes: true }),
    );
    const state = await readKitState(dir);
    expect(state.kitVersion).toBe("0.1.0");
    expect(state.kitRepo).toBe("https://github.com/webamigos/wa-kit.git");
    expect(state.project).toEqual({ name: "Acme Shop", slug: "acme-shop" });
    expect(state.locales).toEqual(["pl"]);
    expect(state.projectModules).toEqual({});
    expect(state.modules["core"]?.version).toBe("0.2.0");
    expect(state.modules["demo"]?.version).toBe("0.3.0");
  });

  it("bez języków w opcjach z --yes przyjmuje pl i en", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    expect((await readKitState(dir)).locales).toEqual(["pl", "en"]);
    expect(await read(dir, "src/i18n/locales.generated.ts")).toContain(
      'export const locales = ["pl", "en"] as const;',
    );
  });

  it("wybrane języki trafiają do pliku locales.generated.ts", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, locales: ["pl"], yes: true }));
    expect(await read(dir, "src/i18n/locales.generated.ts")).toContain(
      'export const locales = ["pl"] as const;',
    );
  });

  it("zapisuje hashe plików modułów: zwykłe sha256, placeholdery, regiony i managed", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, modules: ["demo"], yes: true }));
    const state = await readKitState(dir);
    expect(state.modules["demo"]?.files["src/features/demo/module.ts"]).toBe(
      "78ab707c1774809aed2547ae01451c9707017083c23b6383f6199d0d4c22863b",
    );
    const coreFiles = state.modules["core"]?.files ?? {};
    expect(coreFiles["src/shared/config/project.ts"]).toBe(
      "d5a1b6805846b5c0de242d422f168eb365f7f17de2c38b3320675df2b6f78d67",
    );
    expect(coreFiles[".env.example"]).toBe(
      "f306ee02586966f80f3f408488855123bfc2bfd44d79cceb34158f17ffb0fbd5",
    );
    expect(coreFiles["package.json"]).toBe("managed");
    expect(coreFiles["package-lock.json"]).toBe("managed");
  });

  it("w files modułów są tylko pliki modułu, bez kit-only i generowanych", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, modules: ["demo"], yes: true }));
    const state = await readKitState(dir);
    expect(Object.keys(state.modules["core"]?.files ?? {}).sort()).toEqual([
      ".env.example",
      ".wa/bin/wa.mjs",
      "docker-compose.yml",
      "package-lock.json",
      "package.json",
      "prisma/schema/auth.prisma",
      "prisma/schema/organizations.prisma",
      "src/features/auth/module.ts",
      "src/i18n/config.ts",
      "src/shared/config/project.ts",
    ]);
    expect(Object.keys(state.modules["demo"]?.files ?? {}).sort()).toEqual([
      "src/features/demo/compose.yml",
      "src/features/demo/env.ts",
      "src/features/demo/i18n/pl.json",
      "src/features/demo/module.ts",
    ]);
  });

  it("nie kopiuje wygenerowanego pliku z kitu: rejestr jest odtworzony przez generate", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    expect(await read(dir, "src/modules.generated.ts")).not.toContain("stale");
  });

  it("podmienia placeholdery w plikach z placeholderFiles i zostawia pozostałe", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    expect(await read(dir, "docker-compose.yml")).toContain("name: acme-shop");
    expect(await read(dir, ".env.example")).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acme_shop",
    );
    expect(await read(dir, "src/features/auth/module.ts")).toBe(
      'export default { key: "auth" };\n',
    );
  });

  it("własny tytuł trafia do project.ts i kit.json, slug zostaje z nazwy katalogu", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, title: "Sklep Acme", yes: true }));
    expect(await read(dir, "src/shared/config/project.ts")).toContain(
      '"Sklep Acme"',
    );
    expect((await readKitState(dir)).project).toEqual({
      name: "Sklep Acme",
      slug: "acme-shop",
    });
  });

  it("generate uwzględnia wybrane moduły: relacje, compose i rejestr", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, modules: ["demo"], yes: true }));
    expect(await read(dir, "prisma/schema/auth.prisma")).toContain(
      "demos Demo[]",
    );
    expect(await read(dir, "docker-compose.yml")).toContain(
      "  demo:\n    image: demo:latest",
    );
  });

  it("bez modułów: brak zależności demo, relacji i usługi, a drugie generate bez zmian", async () => {
    const dir = join(tmp, "core-only");
    await create(opts({ target: dir, modules: [], yes: true }));
    expect(JSON.parse(await read(dir, "package.json")).dependencies).toEqual({
      zod: "^4.3.6",
    });
    expect(await read(dir, "prisma/schema/auth.prisma")).not.toContain("Demo");
    expect(await read(dir, "docker-compose.yml")).not.toContain("demo:");
    expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
    expect((await generate(dir)).changed).toEqual([]);
  });

  it("z --yes i modules null składa tylko core", async () => {
    const dir = join(tmp, "core-only");
    await create(opts({ target: dir, modules: null, yes: true }));
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
  });

  it("nieznany moduł kończy się błędem i nie zostawia katalogu", async () => {
    const dir = join(tmp, "acme-shop");
    await expect(
      create(opts({ target: dir, modules: ["nope"], yes: true })),
    ).rejects.toThrow("Nieznany moduł: nope");
    expect(existsSync(dir)).toBe(false);
  });

  it("kitDir bez kit/kit.json zgłasza wskazówkę o klonie wa-kit", async () => {
    const emptyKit = await makeTempDir();
    await expect(create(opts({ kitDir: emptyKit, yes: true }))).rejects.toThrow(
      "Uruchom create z klonu wa-kit albo podaj --kit <ścieżka>",
    );
    expect(existsSync(join(tmp, "acme-shop"))).toBe(false);
  });
});

describe("create: .env", () => {
  it("BETTER_AUTH_SECRET ma 43 znaki base64url i nie zawiera change-me", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    const env = await read(dir, ".env");
    expect(env).toMatch(SECRET_LINE);
    expect(env.match(/BETTER_AUTH_SECRET=/g)).toHaveLength(1);
    expect(env).not.toContain("change-me");
  });

  it("dwa wywołania create dają różne sekrety", async () => {
    const first = join(tmp, "first-app");
    const second = join(tmp, "second-app");
    await create(opts({ target: first, yes: true }));
    await create(opts({ target: second, yes: true }));
    const firstSecret = SECRET_LINE.exec(await read(first, ".env"))?.[1];
    const secondSecret = SECRET_LINE.exec(await read(second, ".env"))?.[1];
    expect(firstSecret).toHaveLength(43);
    expect(secondSecret).toHaveLength(43);
    expect(firstSecret).not.toBe(secondSecret);
  });

  it("zachowuje pozostałe linie .env.example z podmienionymi placeholderami", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    expect(await read(dir, ".env")).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acme_shop\n",
    );
  });

  it("z adminEmail zapisuje ADMIN_EMAIL=a@x.pl", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, adminEmail: "a@x.pl", yes: true }));
    const env = await read(dir, ".env");
    expect(env).toMatch(/^ADMIN_EMAIL=a@x\.pl$/m);
    expect(env.match(/ADMIN_EMAIL=/g)).toHaveLength(1);
  });

  it("bez adminEmail ADMIN_EMAIL zostaje pusty", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    const env = await read(dir, ".env");
    expect(env).toMatch(/^ADMIN_EMAIL=$/m);
  });

  it(".env.example w projekcie nie zawiera sekretu ani adminEmail", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, adminEmail: "a@x.pl", yes: true }));
    const example = await read(dir, ".env.example");
    expect(example).toContain("change-me");
    expect(example).not.toContain("a@x.pl");
  });
});

describe("create: katalog docelowy", () => {
  it("niepusty katalog → błąd, istniejące pliki nietknięte", async () => {
    const dir = join(tmp, "zajety");
    await mkdir(dir);
    await writeFile(join(dir, "x.txt"), "x");
    await expect(create(opts({ target: dir, yes: true }))).rejects.toThrow(
      `Katalog ${dir} istnieje i nie jest pusty`,
    );
    expect(await readdir(dir)).toEqual(["x.txt"]);
  });

  it("niepusty katalog z kolidującym plikiem nie jest nadpisany", async () => {
    const dir = join(tmp, "acme-shop");
    await mkdir(dir);
    await writeFile(join(dir, "package.json"), "moje");
    await expect(create(opts({ target: dir, yes: true }))).rejects.toThrow(
      "istnieje i nie jest pusty",
    );
    expect(await read(dir, "package.json")).toBe("moje");
    expect(await readdir(dir)).toEqual(["package.json"]);
  });

  it("niepusty katalog z ukrytym plikiem też jest odrzucony", async () => {
    const dir = join(tmp, "acme-shop");
    await mkdir(dir);
    await writeFile(join(dir, ".hidden"), "x");
    await expect(create(opts({ target: dir, yes: true }))).rejects.toThrow(
      "istnieje i nie jest pusty",
    );
    expect(await readdir(dir)).toEqual([".hidden"]);
  });

  it("niepusty katalog: żadne polecenie runnera ani pytanie nie padają", async () => {
    const dir = join(tmp, "acme-shop");
    await mkdir(dir);
    await writeFile(join(dir, "x.txt"), "x");
    const { prompter } = scriptedPrompter([]);
    await expect(
      create(
        opts({
          target: dir,
          install: true,
          git: true,
          modules: null,
          prompter,
        }),
      ),
    ).rejects.toThrow("istnieje i nie jest pusty");
    expect(runner).not.toHaveBeenCalled();
    expect(prompter.ask).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
  });

  it("istniejący pusty katalog → sukces", async () => {
    const dir = join(tmp, "acme-shop");
    await mkdir(dir);
    await create(opts({ target: dir, yes: true }));
    expect(existsSync(join(dir, ".wa/kit.json"))).toBe(true);
  });

  it("zła nazwa → błąd Nazwa projektu i katalog nie powstaje", async () => {
    await expect(
      create(opts({ target: join(tmp, "Zla Nazwa"), yes: true })),
    ).rejects.toThrow("Nazwa projektu");
    expect(existsSync(join(tmp, "Zla Nazwa"))).toBe(false);
  });

  it("zła nazwa kończy się błędem przed pytaniami i poleceniami", async () => {
    const { prompter } = scriptedPrompter([]);
    await expect(
      create(
        opts({
          target: join(tmp, "Zla Nazwa"),
          modules: null,
          install: true,
          git: true,
          prompter,
        }),
      ),
    ).rejects.toThrow("Nazwa projektu");
    expect(prompter.ask).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("create: błąd podczas składania", () => {
  async function breakEnvRegion(): Promise<void> {
    await writeFile(
      join(kit, ".env.example"),
      "DATABASE_URL=x\n# wa:modules:start\n",
    );
  }

  it("usuwa katalog utworzony przez create i zostawia sąsiadów", async () => {
    await breakEnvRegion();
    await writeFile(join(tmp, "sasiad.txt"), "s");
    const dir = join(tmp, "acme-shop");
    await expect(create(opts({ target: dir, yes: true }))).rejects.toThrow(
      "uszkodzony region wa:modules",
    );
    expect(existsSync(dir)).toBe(false);
    expect(await readdir(tmp)).toContain("sasiad.txt");
  });

  it("katalog, który istniał, zostaje i jest pusty", async () => {
    await breakEnvRegion();
    const dir = join(tmp, "acme-shop");
    await mkdir(dir);
    await expect(create(opts({ target: dir, yes: true }))).rejects.toThrow(
      "uszkodzony region wa:modules",
    );
    expect(existsSync(dir)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });

  it("po błędzie nie uruchamia żadnych poleceń", async () => {
    await breakEnvRegion();
    await expect(
      create(opts({ yes: true, install: true, git: true, setup: true })),
    ).rejects.toThrow("uszkodzony region wa:modules");
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("create: polecenia", () => {
  it("bez install i git nie woła runnera", async () => {
    await create(opts({ yes: true }));
    expect(runner).not.toHaveBeenCalled();
  });

  it("install + git bez setup: git init przed npm install, potem commit", async () => {
    await create(opts({ yes: true, install: true, git: true }));
    expect(commands()).toEqual([
      "git init -q",
      "npm install",
      "git add -A",
      COMMIT_COMMAND,
    ]);
  });

  it("tylko install: samo npm install", async () => {
    await create(opts({ yes: true, install: true, git: false }));
    expect(commands()).toEqual(["npm install"]);
  });

  it("tylko git: init, add i commit bez npm install", async () => {
    await create(opts({ yes: true, install: false, git: true }));
    expect(commands()).toEqual(["git init -q", "git add -A", COMMIT_COMMAND]);
  });

  it("wszystkie polecenia idą w katalogu projektu", async () => {
    const dir = join(tmp, "acme-shop");
    await create(
      opts({
        target: dir,
        yes: true,
        install: true,
        git: true,
        setup: true,
        adminEmail: "a@x.pl",
      }),
    );
    expect(runner.mock.calls.length).toBe(7);
    expect(runner.mock.calls.map(([, , cwd]) => cwd)).toEqual(
      Array(7).fill(dir),
    );
  });

  it("install + git + setup: komendy w kolejności", async () => {
    await create(
      opts({
        target: join(tmp, "full"),
        yes: true,
        install: true,
        git: true,
        setup: true,
        adminEmail: "a@x.pl",
      }),
    );
    expect(commands()).toEqual([
      "git init -q",
      "npm install",
      "git add -A",
      COMMIT_COMMAND,
      "docker compose up -d --wait",
      "npx prisma migrate dev --name init",
      "npm run admin:create -- --email a@x.pl",
    ]);
  });

  it("setup bez adminEmail pomija admin:create", async () => {
    await create(opts({ yes: true, install: true, git: true, setup: true }));
    expect(commands()).toEqual([
      "git init -q",
      "npm install",
      "git add -A",
      COMMIT_COMMAND,
      "docker compose up -d --wait",
      "npx prisma migrate dev --name init",
    ]);
  });

  it("bez flagi setup nie uruchamia bazy, migracji ani admin:create", async () => {
    await create(
      opts({
        yes: true,
        install: true,
        git: true,
        setup: false,
        adminEmail: "a@x.pl",
      }),
    );
    expect(commands().join("\n")).not.toMatch(/docker|prisma|admin:create/);
  });

  it("npm install pada → komunikat z instrukcją, kit.json zapisany, katalog zostaje", async () => {
    runner.mockRejectedValueOnce(new Error("npm install zakończone kodem 1"));
    const dir = join(tmp, "broken-install");
    await expect(
      create(opts({ target: dir, yes: true, install: true })),
    ).rejects.toThrow(
      `Projekt utworzony w ${dir}, ale npm install się nie powiódł. Uruchom: cd ${dir} && npm install`,
    );
    expect(existsSync(join(dir, ".wa/kit.json"))).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(true);
  });

  it("npm install pada → nie ma commita ani setupu", async () => {
    runner.mockImplementation(async (command, args) => {
      if (command === "npm" && args[0] === "install") {
        throw new Error("npm install zakończone kodem 1");
      }
    });
    await expect(
      create(opts({ yes: true, install: true, git: true, setup: true })),
    ).rejects.toThrow("Uruchom: cd");
    expect(commands()).toEqual(["git init -q", "npm install"]);
  });

  it("git commit pada → log z ostrzeżeniem i create kończy się sukcesem", async () => {
    runner.mockImplementation(async (_command, args) => {
      if (args[0] === "commit") throw new Error("boom");
    });
    const dir = join(tmp, "acme-shop");
    const result = await create(
      opts({ target: dir, yes: true, install: true, git: true }),
    );
    expect(result.projectDir).toBe(dir);
    expect(logs).toContain(
      "Uwaga: nie utworzono commita (boom). Skonfiguruj git i zrób commit ręcznie.",
    );
  });

  it("git commit pada → setup nadal się wykonuje", async () => {
    runner.mockImplementation(async (_command, args) => {
      if (args[0] === "commit") throw new Error("boom");
    });
    await create(opts({ yes: true, install: true, git: true, setup: true }));
    expect(commands().slice(-2)).toEqual([
      "docker compose up -d --wait",
      "npx prisma migrate dev --name init",
    ]);
  });

  it("udany commit nie loguje ostrzeżenia", async () => {
    await create(opts({ yes: true, install: true, git: true }));
    expect(logs.join("\n")).not.toContain("nie utworzono commita");
  });

  it.each([
    ["nieistniejący", false],
    ["pusty", true],
  ])(
    "plik z pytań w katalogu (%s) przerywa create bez zapisu i kasowania",
    async (_nazwa, istniejacy) => {
      const dir = join(tmp, "acme-shop");
      if (istniejacy) await mkdir(dir);
      const prompter: Prompter = {
        ask: vi.fn(async (_question: string, fallback: string) => {
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, "obcy.txt"), "cudze");
          return fallback;
        }),
        confirm: vi.fn(
          async (_question: string, fallback: boolean) => fallback,
        ),
        select: vi.fn(async (_question: string, choices: SelectChoice[]) =>
          checkedValues(choices),
        ),
      };
      await expect(
        create(opts({ target: dir, modules: null, prompter })),
      ).rejects.toThrow(`Katalog ${dir} istnieje i nie jest pusty`);
      expect(await readdir(dir)).toEqual(["obcy.txt"]);
      expect(await read(dir, "obcy.txt")).toBe("cudze");
      expect(runner).not.toHaveBeenCalled();
    },
  );
});

const MODULE_CHOICES = [
  { value: "demo", label: "demo — Demo fixture" },
  { value: "needs-demo", label: "needs-demo — Needs demo fixture" },
];
const LOCALE_CHOICES = [
  { value: "pl", label: "pl", checked: true, locked: true },
  { value: "en", label: "en", checked: true },
];

describe("create: pytania", () => {
  it("wybór demo, pl, Acme, pusty email i brak setupu składają projekt", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter(
      ["Acme", ""],
      [false],
      [["demo"], ["pl"]],
    );
    await create(opts({ target: dir, modules: null, install: true, prompter }));
    const state = await readKitState(dir);
    expect(Object.keys(state.modules)).toEqual(["core", "demo"]);
    expect(state.locales).toEqual(["pl"]);
    expect(state.project.name).toBe("Acme");
    expect(await read(dir, ".env")).toMatch(/^ADMIN_EMAIL=$/m);
    expect(commands()).toEqual(["npm install"]);
  });

  it("pyta w kolejności: moduły, języki, nazwa, email, setup, z domyślnymi wartościami", async () => {
    const { prompter, questions } = scriptedPrompter([], []);
    await create(opts({ modules: null, install: true, prompter }));
    expect(questions).toEqual([
      { question: "Moduły", choices: MODULE_CHOICES },
      { question: "Języki", choices: LOCALE_CHOICES },
      { question: "Nazwa wyświetlana", fallback: "Acme Shop" },
      { question: "Email admina (puste = pomiń)", fallback: "" },
      {
        question: "Uruchomić bazę, migrację i admin:create teraz? [t/N]",
        fallback: false,
      },
    ]);
  });

  it("lista modułów zawiera moduły kitu z opisami, bez core, niezaznaczone", async () => {
    const { prompter, selections } = scriptedPrompter([]);
    await create(opts({ modules: null, prompter }));
    expect(selections[0]).toEqual({
      question: "Moduły",
      choices: MODULE_CHOICES,
    });
  });

  it("lista języków ma pl zaznaczony i zablokowany oraz zaznaczony en", async () => {
    const { prompter, selections } = scriptedPrompter([]);
    await create(opts({ modules: null, prompter }));
    expect(selections[1]).toEqual({
      question: "Języki",
      choices: LOCALE_CHOICES,
    });
  });

  it("wybór samego needs-demo dociąga zależność demo", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter([], [], [["needs-demo"]]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect(Object.keys((await readKitState(dir)).modules)).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
  });

  it("pusty wybór modułów oznacza żaden moduł poza core", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter([], [], [[]]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
  });

  it("kit bez modułów poza core nie pyta o moduły i składa projekt z samym core", async () => {
    await promisify(execFile)("git", [
      "-C",
      kit,
      "rm",
      "-qf",
      "kit/modules/demo.json",
      "kit/modules/needs-demo.json",
    ]);
    const dir = join(tmp, "acme-shop");
    const { prompter, selections } = scriptedPrompter([]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect(selections.map((selection) => selection.question)).toEqual([
      "Języki",
    ]);
    expect(Object.keys((await readKitState(dir)).modules)).toEqual(["core"]);
  });

  it("wybór samego pl zapisuje języki [pl]", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter([], [], [[], ["pl"]]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect((await readKitState(dir)).locales).toEqual(["pl"]);
  });

  it("wybór pl i en zapisuje języki [pl, en]", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter([], [], [[], ["pl", "en"]]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect((await readKitState(dir)).locales).toEqual(["pl", "en"]);
  });

  it("odpowiedź z emailem trafia do .env", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter(["Acme", "b@x.pl"]);
    await create(opts({ target: dir, modules: null, prompter }));
    expect(await read(dir, ".env")).toMatch(/^ADMIN_EMAIL=b@x\.pl$/m);
  });

  it("wybór języków bez pl daje błąd walidacji bez ponawiania pytania", async () => {
    const { prompter, questions } = scriptedPrompter([], [], [[], ["en"]]);
    await expect(create(opts({ modules: null, prompter }))).rejects.toThrow(
      "--locales: dozwolone pl,en; pl jest wymagany",
    );
    expect(questions).toHaveLength(2);
    expect(existsSync(join(tmp, "acme-shop"))).toBe(false);
  });

  it("wybór języka spoza pl,en daje błąd walidacji", async () => {
    const { prompter } = scriptedPrompter([], [], [[], ["pl", "de"]]);
    await expect(create(opts({ modules: null, prompter }))).rejects.toThrow(
      "--locales: dozwolone pl,en; pl jest wymagany",
    );
  });

  it("wybór języków z duplikatami daje błąd walidacji i nie tworzy katalogu", async () => {
    const dir = join(tmp, "acme-shop");
    const { prompter } = scriptedPrompter([], [], [[], ["pl", "pl"]]);
    await expect(
      create(opts({ target: dir, modules: null, prompter })),
    ).rejects.toThrow("--locales: dozwolone pl,en; pl jest wymagany");
    expect(existsSync(dir)).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it("ask pyta tylko o nazwę i email, nie o moduły ani języki", async () => {
    const { prompter } = scriptedPrompter([]);
    await create(opts({ modules: null, prompter }));
    expect(
      vi.mocked(prompter.ask).mock.calls.map(([question]) => question),
    ).toEqual(["Nazwa wyświetlana", "Email admina (puste = pomiń)"]);
  });

  it("z podanymi modułami lista pojawia się tylko dla języków", async () => {
    const { prompter, selections } = scriptedPrompter([]);
    await create(opts({ modules: ["demo"], prompter }));
    expect(selections.map(({ question }) => question)).toEqual(["Języki"]);
  });

  it("z podanymi językami lista pojawia się tylko dla modułów", async () => {
    const { prompter, selections } = scriptedPrompter([]);
    await create(opts({ modules: null, locales: ["pl"], prompter }));
    expect(selections.map(({ question }) => question)).toEqual(["Moduły"]);
  });

  it("bez install nie pyta o setup, ale pyta o moduły, języki, nazwę i email", async () => {
    const { prompter, questions } = scriptedPrompter([]);
    await create(opts({ modules: null, install: false, prompter }));
    expect(questions.map(({ question }) => question)).toEqual([
      "Moduły",
      "Języki",
      "Nazwa wyświetlana",
      "Email admina (puste = pomiń)",
    ]);
    expect(prompter.confirm).not.toHaveBeenCalled();
  });

  it("z install bez yes pyta o setup", async () => {
    const { prompter } = scriptedPrompter([]);
    await create(opts({ modules: [], install: true, prompter }));
    expect(prompter.confirm).toHaveBeenCalledWith(
      "Uruchomić bazę, migrację i admin:create teraz? [t/N]",
      false,
    );
  });

  it("potwierdzenie setupu w pytaniu uruchamia bazę i migrację", async () => {
    const { prompter } = scriptedPrompter([], [true]);
    await create(opts({ install: true, git: false, prompter }));
    expect(commands()).toEqual([
      "npm install",
      "docker compose up -d --wait",
      "npx prisma migrate dev --name init",
    ]);
  });

  it("odmowa setupu w pytaniu nie uruchamia bazy", async () => {
    const { prompter } = scriptedPrompter([], [false]);
    await create(opts({ install: true, git: false, prompter }));
    expect(commands()).toEqual(["npm install"]);
  });

  it("z --yes nie zadaje żadnych pytań", async () => {
    const { prompter } = scriptedPrompter([]);
    await create(opts({ yes: true, modules: null, prompter }));
    expect(prompter.ask).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
    expect(prompter.confirm).not.toHaveBeenCalled();
  });

  it("nie pyta o to, co podano w opcjach, także o setup", async () => {
    const { prompter } = scriptedPrompter([]);
    await create(
      opts({
        modules: ["demo"],
        locales: ["pl"],
        title: "T",
        adminEmail: "a@x.pl",
        setup: true,
        prompter,
      }),
    );
    expect(prompter.ask).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
    expect(prompter.confirm).not.toHaveBeenCalled();
  });

  it("pyta tylko o brakujące: przy podanych modułach trzy pytania i setup", async () => {
    const { prompter, questions } = scriptedPrompter([]);
    await create(opts({ modules: ["demo"], install: true, prompter }));
    expect(questions.map(({ question }) => question)).toEqual([
      "Języki",
      "Nazwa wyświetlana",
      "Email admina (puste = pomiń)",
      "Uruchomić bazę, migrację i admin:create teraz? [t/N]",
    ]);
  });
});

describe("create: kroki końcowe", () => {
  function indexesOf(fragments: string[]): number[] {
    const joined = logs.join("\n");
    return fragments.map((fragment) => joined.indexOf(fragment));
  }

  it("bez setup wypisuje pięć kroków w kolejności z twój-email przy braku emaila", async () => {
    const dir = join(tmp, "acme-shop");
    await create(opts({ target: dir, yes: true }));
    const positions = indexesOf([
      `cd ${dir}`,
      "docker compose up -d",
      "npx prisma migrate dev --name init",
      "npm run admin:create -- --email twój-email",
      "npm run dev",
    ]);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("bez setup z emailem wypisuje go w kroku admin:create", async () => {
    await create(opts({ yes: true, adminEmail: "a@x.pl" }));
    const joined = logs.join("\n");
    expect(joined).toContain("npm run admin:create -- --email a@x.pl");
    expect(joined).not.toContain("twój-email");
  });

  it("po setup wypisuje tylko cd i npm run dev", async () => {
    const dir = join(tmp, "acme-shop");
    await create(
      opts({
        target: dir,
        yes: true,
        install: true,
        setup: true,
        adminEmail: "a@x.pl",
      }),
    );
    const joined = logs.join("\n");
    expect(joined).toContain(`cd ${dir}`);
    expect(joined).toContain("npm run dev");
    expect(joined).not.toContain("docker compose up -d");
    expect(joined).not.toContain("prisma migrate");
    expect(joined).not.toContain("admin:create");
  });
});

describe("readlinePrompter", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY as boolean;
  });

  it("ask bez terminala zgłasza Brak terminala: użyj --yes", async () => {
    await expect(readlinePrompter.ask("Pytanie?", "x")).rejects.toThrow(
      "Brak terminala: użyj --yes",
    );
  });

  it("confirm bez terminala zgłasza Brak terminala: użyj --yes", async () => {
    await expect(readlinePrompter.confirm("Pytanie?", false)).rejects.toThrow(
      "Brak terminala: użyj --yes",
    );
  });

  it("create bez terminala i bez modułów w opcjach zgłasza Brak terminala i nie tworzy katalogu", async () => {
    const dir = join(tmp, "acme-shop");
    await expect(
      create(opts({ target: dir, modules: null, prompter: readlinePrompter })),
    ).rejects.toThrow("Brak terminala: użyj --yes");
    expect(existsSync(dir)).toBe(false);
  });
});

describe("create: pytania i kotwice linii .env", () => {
  it("zadaje pytania o języki, nazwę, email admina i setup", async () => {
    const { prompter, questions } = scriptedPrompter([]);
    await create(opts({ modules: [], install: true, prompter }));
    expect(questions.slice(0, 4)).toEqual([
      { question: "Języki", choices: LOCALE_CHOICES },
      { question: "Nazwa wyświetlana", fallback: "Acme Shop" },
      { question: "Email admina (puste = pomiń)", fallback: "" },
      {
        question: "Uruchomić bazę, migrację i admin:create teraz? [t/N]",
        fallback: false,
      },
    ]);
  });

  it("podmienia tylko linie zaczynające się od klucza, nie wystąpienia w środku linii", async () => {
    const example = join(kit, ".env.example");
    const original = await readFile(example, "utf8");
    await writeFile(
      example,
      `# kopia: BETTER_AUTH_SECRET=stare\nX_ADMIN_EMAIL=stare\n${original}`,
    );
    const dir = join(tmp, "acme-shop");
    await create(
      opts({
        target: dir,
        modules: [],
        yes: true,
        adminEmail: "a@x.pl",
      }),
    );
    const env = await read(dir, ".env");
    expect(env).toContain("# kopia: BETTER_AUTH_SECRET=stare\n");
    expect(env).toContain("X_ADMIN_EMAIL=stare\n");
    expect(env).toMatch(SECRET_LINE);
    expect(env).toMatch(/^ADMIN_EMAIL=a@x\.pl$/m);
    expect(env).not.toContain("change-me");
  });
});
