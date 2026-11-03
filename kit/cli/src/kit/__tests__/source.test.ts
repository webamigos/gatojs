import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import type { KitState } from "../../manifest/schema.js";
import { spawnRunner } from "../../process/runner.js";
import type { Runner } from "../../process/runner.js";
import {
  cloneKitVersion,
  kitSourceLocation,
  resolveKitSource,
} from "../source.js";

const git = promisify(execFile);

const baseState: KitState = {
  kitVersion: "0.1.0",
  kitRepo: "https://github.com/webamigos/wa-kit.git",
  project: { name: "WA App", slug: "wa-app" },
  locales: ["pl", "en"],
  modules: {},
  projectModules: {},
};

let tmpDir: string;
let runner: ReturnType<typeof vi.fn<Runner>>;

beforeEach(async () => {
  tmpDir = await makeTempDir();
  runner = vi.fn<Runner>(async () => {});
});

afterEach(async () => {
  await removeTempDirs();
});

describe("resolveKitSource", () => {
  it("lokalna ścieżka z zgodną wersją jest zwracana bez klonowania", async () => {
    const kitDir = await makeKitRepo("kit");
    const source = await resolveKitSource({
      kitFlag: kitDir,
      envSource: undefined,
      state: baseState,
      runner,
      tmpDir,
    });
    expect(source).toBe(kitDir);
    expect(runner).not.toHaveBeenCalled();
  });

  it("lokalny kit w wersji 0.1.0 przy projekcie 9.9.9 kończy się błędem z obiema wersjami", async () => {
    const kitDir = await makeKitRepo("kit");
    await expect(
      resolveKitSource({
        kitFlag: kitDir,
        envSource: undefined,
        state: { ...baseState, kitVersion: "9.9.9" },
        runner,
        tmpDir,
      }),
    ).rejects.toThrow(`Kit w ${kitDir} ma wersję 0.1.0, projekt używa 9.9.9`);
  });

  it("niezgodna wersja lokalnego kitu z WA_KIT_SOURCE też kończy się błędem", async () => {
    const kitDir = await makeKitRepo("kit");
    await expect(
      resolveKitSource({
        kitFlag: null,
        envSource: kitDir,
        state: { ...baseState, kitVersion: "9.9.9" },
        runner,
        tmpDir,
      }),
    ).rejects.toThrow("ma wersję 0.1.0, projekt używa 9.9.9");
  });

  it("niezgodna wersja lokalnego kitu z state.kitRepo też kończy się błędem", async () => {
    const kitDir = await makeKitRepo("kit");
    await expect(
      resolveKitSource({
        kitFlag: null,
        envSource: undefined,
        state: { ...baseState, kitVersion: "9.9.9", kitRepo: kitDir },
        runner,
        tmpDir,
      }),
    ).rejects.toThrow("ma wersję 0.1.0, projekt używa 9.9.9");
  });

  it("kitFlag ma pierwszeństwo przed WA_KIT_SOURCE i state.kitRepo", async () => {
    const flagKit = await makeKitRepo("kit");
    const envKit = await makeKitRepo("kit");
    const repoKit = await makeKitRepo("kit");
    const source = await resolveKitSource({
      kitFlag: flagKit,
      envSource: envKit,
      state: { ...baseState, kitRepo: repoKit },
      runner,
      tmpDir,
    });
    expect(source).toBe(flagKit);
  });

  it("WA_KIT_SOURCE ma pierwszeństwo przed state.kitRepo, gdy brak kitFlag", async () => {
    const envKit = await makeKitRepo("kit");
    const repoKit = await makeKitRepo("kit");
    const source = await resolveKitSource({
      kitFlag: null,
      envSource: envKit,
      state: { ...baseState, kitRepo: repoKit },
      runner,
      tmpDir,
    });
    expect(source).toBe(envKit);
  });

  it("state.kitRepo jest użyte, gdy brak kitFlag i WA_KIT_SOURCE", async () => {
    const repoKit = await makeKitRepo("kit");
    const source = await resolveKitSource({
      kitFlag: null,
      envSource: undefined,
      state: { ...baseState, kitRepo: repoKit },
      runner,
      tmpDir,
    });
    expect(source).toBe(repoKit);
  });

  it("URL z :// jest klonowany płytko na tag wersji projektu do tmpDir/wa-kit", async () => {
    const source = await resolveKitSource({
      kitFlag: "https://example.com/org/wa-kit.git",
      envSource: undefined,
      state: baseState,
      runner,
      tmpDir,
    });
    expect(source).toBe(join(tmpDir, "wa-kit"));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        "v0.1.0",
        "--quiet",
        "--",
        "https://example.com/org/wa-kit.git",
        join(tmpDir, "wa-kit"),
      ],
      expect.any(String),
    );
  });

  it("adres git@ jest traktowany jak URL, a nie jak ścieżka lokalna", async () => {
    const source = await resolveKitSource({
      kitFlag: "git@github.com:webamigos/wa-kit.git",
      envSource: undefined,
      state: baseState,
      runner,
      tmpDir,
    });
    expect(source).toBe(join(tmpDir, "wa-kit"));
    expect(runner).toHaveBeenCalledWith(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        "v0.1.0",
        "--quiet",
        "--",
        "git@github.com:webamigos/wa-kit.git",
        join(tmpDir, "wa-kit"),
      ],
      expect.any(String),
    );
  });

  it.each([
    ["kitFlag", "--upload-pack=touch /tmp/x://"],
    ["envSource", "--upload-pack=touch /tmp/x://"],
    ["state.kitRepo", "--upload-pack=touch /tmp/x://"],
    ["kitFlag", "-lokalny-katalog"],
    ["envSource", "-lokalny-katalog"],
    ["state.kitRepo", "-lokalny-katalog"],
  ])(
    "źródło z %s zaczynające się od myślnika (%s) jest odrzucone przed uruchomieniem runnera",
    async (origin, value) => {
      await expect(
        resolveKitSource({
          kitFlag: origin === "kitFlag" ? value : null,
          envSource: origin === "envSource" ? value : undefined,
          state:
            origin === "state.kitRepo"
              ? { ...baseState, kitRepo: value }
              : baseState,
          runner,
          tmpDir,
        }),
      ).rejects.toThrow(`Nieprawidłowe źródło wa-kit: ${value}`);
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      "ext::sh -c touch% /tmp/x",
      "ext::sh -c x ://",
      "fd::3",
      "git://host/repo.git",
      "http://host/repo.git",
    ].flatMap((value) =>
      ["kitFlag", "envSource", "state.kitRepo"].map(
        (origin) => [origin, value] as const,
      ),
    ),
  )(
    "źródło z %s o nieznanym transporcie (%s) jest odrzucone przed uruchomieniem runnera",
    async (origin, value) => {
      await expect(
        resolveKitSource({
          kitFlag: origin === "kitFlag" ? value : null,
          envSource: origin === "envSource" ? value : undefined,
          state:
            origin === "state.kitRepo"
              ? { ...baseState, kitRepo: value }
              : baseState,
          runner,
          tmpDir,
        }),
      ).rejects.toThrow(`Nieprawidłowe źródło wa-kit: ${value}`);
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://github.com/webamigos/wa-kit.git",
    "ssh://git@github.com/webamigos/wa-kit.git",
    "file:///tmp/wa-kit.git",
    "git@github.com:webamigos/wa-kit.git",
  ])(
    "źródło %s ze znanym transportem jest klonowane jako zdalne",
    async (url) => {
      const source = await resolveKitSource({
        kitFlag: url,
        envSource: undefined,
        state: baseState,
        runner,
        tmpDir,
      });
      expect(source).toBe(join(tmpDir, "wa-kit"));
      expect(runner).toHaveBeenCalledTimes(1);
      expect(runner).toHaveBeenCalledWith(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          "v0.1.0",
          "--quiet",
          "--",
          url,
          join(tmpDir, "wa-kit"),
        ],
        expect.any(String),
      );
    },
  );

  it("tag w klonie wynika z wersji projektu", async () => {
    await resolveKitSource({
      kitFlag: "git@github.com:webamigos/wa-kit.git",
      envSource: undefined,
      state: { ...baseState, kitVersion: "2.4.6" },
      runner,
      tmpDir,
    });
    expect(runner.mock.calls[0]?.[1]).toContain("v2.4.6");
  });

  it("domyślne state.kitRepo w postaci URL jest klonowane", async () => {
    await resolveKitSource({
      kitFlag: null,
      envSource: undefined,
      state: baseState,
      runner,
      tmpDir,
    });
    expect(runner.mock.calls[0]?.[1]).toContain(
      "https://github.com/webamigos/wa-kit.git",
    );
  });

  it("błąd klonowania dostaje komunikat z wersją, adresem i podpowiedzią", async () => {
    runner.mockRejectedValueOnce(new Error("fatal"));
    await expect(
      resolveKitSource({
        kitFlag: "https://example.com/org/wa-kit.git",
        envSource: undefined,
        state: baseState,
        runner,
        tmpDir,
      }),
    ).rejects.toThrow(
      "Nie udało się pobrać wa-kit v0.1.0 z https://example.com/org/wa-kit.git. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>",
    );
  });

  it("nieistniejące repo przez prawdziwy git kończy się podpowiedzią gh auth status i --kit", async () => {
    await expect(
      resolveKitSource({
        kitFlag: "file:///nie/istnieje.git",
        envSource: undefined,
        state: baseState,
        runner: spawnRunner,
        tmpDir,
      }),
    ).rejects.toThrow(
      "Nie udało się pobrać wa-kit v0.1.0 z file:///nie/istnieje.git. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>",
    );
  });
});

async function setKitVersion(dir: string, version: string): Promise<void> {
  const path = join(dir, "kit/kit.json");
  const config = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(path, JSON.stringify({ ...config, version }, null, 2));
}

async function commitAndTag(dir: string, tag: string): Promise<void> {
  await git("git", ["-C", dir, "add", "-A"]);
  await git("git", ["-C", dir, "commit", "-q", "-m", tag]);
  await git("git", ["-C", dir, "tag", "-a", tag, "-m", tag]);
}

async function makeTaggedRepo(): Promise<string> {
  const dir = await makeKitRepo("kit");
  await writeFile(join(dir, "marker.txt"), "z tagu v0.1.0");
  await commitAndTag(dir, "v0.1.0");
  await setKitVersion(dir, "0.2.0");
  await writeFile(join(dir, "marker.txt"), "z tagu v0.2.0");
  await commitAndTag(dir, "v0.2.0");
  await writeFile(join(dir, "marker.txt"), "zmiana w drzewie roboczym");
  await setKitVersion(dir, "0.9.0");
  return dir;
}

describe("cloneKitVersion", () => {
  it("klon lokalnego repozytorium na v0.1.0 ma kit.json 0.1.0 i treść z tagu, a nie z drzewa roboczego", async () => {
    const repo = await makeTaggedRepo();
    const cloned = await cloneKitVersion({
      source: repo,
      version: "0.1.0",
      runner: spawnRunner,
      tmpDir,
      name: "stary",
    });
    expect(cloned).toBe(join(tmpDir, "stary"));
    const config = JSON.parse(
      await readFile(join(cloned, "kit/kit.json"), "utf8"),
    ) as { version: string };
    expect(config.version).toBe("0.1.0");
    expect(await readFile(join(cloned, "marker.txt"), "utf8")).toBe(
      "z tagu v0.1.0",
    );
  });

  it("klon na v0.2.0 bierze treść tagu v0.2.0", async () => {
    const repo = await makeTaggedRepo();
    const cloned = await cloneKitVersion({
      source: repo,
      version: "0.2.0",
      runner: spawnRunner,
      tmpDir,
      name: "nowy",
    });
    expect(await readFile(join(cloned, "marker.txt"), "utf8")).toBe(
      "z tagu v0.2.0",
    );
  });

  it("nieistniejący tag kończy się komunikatem z wersją, źródłem i podpowiedzią", async () => {
    const repo = await makeTaggedRepo();
    await expect(
      cloneKitVersion({
        source: repo,
        version: "9.9.9",
        runner: spawnRunner,
        tmpDir,
        name: "brak",
      }),
    ).rejects.toThrow(
      `Nie udało się pobrać wa-kit v9.9.9 z ${repo}. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>`,
    );
  });

  it("tag wskazujący kit w innej wersji kończy się błędem z katalogiem i obiema wersjami", async () => {
    const repo = await makeTaggedRepo();
    await git("git", ["-C", repo, "tag", "-a", "v0.3.0", "v0.2.0", "-m", "x"]);
    await expect(
      cloneKitVersion({
        source: repo,
        version: "0.3.0",
        runner: spawnRunner,
        tmpDir,
        name: "zly",
      }),
    ).rejects.toThrow(
      `Kit w ${join(tmpDir, "zly")} ma wersję 0.2.0, oczekiwano 0.3.0`,
    );
  });

  it("runner dostaje płytki klon tagu wersji z -- przed źródłem i katalogiem tmpDir/name", async () => {
    runner.mockRejectedValueOnce(new Error("stop"));
    await expect(
      cloneKitVersion({
        source: "https://example.com/org/wa-kit.git",
        version: "0.2.0",
        runner,
        tmpDir,
        name: "wa-kit-nowy",
      }),
    ).rejects.toThrow(
      "Nie udało się pobrać wa-kit v0.2.0 z https://example.com/org/wa-kit.git.",
    );
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        "v0.2.0",
        "--quiet",
        "--",
        "https://example.com/org/wa-kit.git",
        join(tmpDir, "wa-kit-nowy"),
      ],
      expect.any(String),
    );
  });

  it("ścieżka lokalna też jest klonowana przez runner, a nie użyta wprost", async () => {
    runner.mockRejectedValueOnce(new Error("stop"));
    await expect(
      cloneKitVersion({
        source: "/sciezka/do/kitu",
        version: "0.1.0",
        runner,
        tmpDir,
        name: "lokalny",
      }),
    ).rejects.toThrow("Nie udało się pobrać wa-kit v0.1.0 z /sciezka/do/kitu.");
    expect(runner.mock.calls[0]?.[1]).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "v0.1.0",
      "--quiet",
      "--",
      "/sciezka/do/kitu",
      join(tmpDir, "lokalny"),
    ]);
  });
});

describe("kitSourceLocation", () => {
  it.each(["-x", "ext::sh", "ext::sh -c touch% /tmp/x"])(
    "flaga --kit=%s jest odrzucona jako nieprawidłowe źródło",
    (value) => {
      expect(() =>
        kitSourceLocation({
          kitFlag: value,
          envSource: undefined,
          state: baseState,
        }),
      ).toThrow(`Nieprawidłowe źródło wa-kit: ${value}`);
    },
  );

  it("WA_KIT_SOURCE zaczynające się od myślnika jest odrzucone", () => {
    expect(() =>
      kitSourceLocation({ kitFlag: null, envSource: "-x", state: baseState }),
    ).toThrow("Nieprawidłowe źródło wa-kit: -x");
  });

  it("bez flagi i WA_KIT_SOURCE zwraca state.kitRepo", () => {
    expect(
      kitSourceLocation({
        kitFlag: null,
        envSource: undefined,
        state: baseState,
      }),
    ).toBe("https://github.com/webamigos/wa-kit.git");
  });

  it("flaga ma pierwszeństwo przed WA_KIT_SOURCE", () => {
    expect(
      kitSourceLocation({
        kitFlag: "git@github.com:flaga/wa-kit.git",
        envSource: "https://example.com/env/wa-kit.git",
        state: baseState,
      }),
    ).toBe("git@github.com:flaga/wa-kit.git");
  });

  it("WA_KIT_SOURCE ma pierwszeństwo przed state.kitRepo", () => {
    expect(
      kitSourceLocation({
        kitFlag: null,
        envSource: "https://example.com/env/wa-kit.git",
        state: baseState,
      }),
    ).toBe("https://example.com/env/wa-kit.git");
  });

  it("względna ścieżka lokalna jest zwracana jako bezwzględna", () => {
    expect(
      kitSourceLocation({
        kitFlag: "kit-lokalny",
        envSource: undefined,
        state: baseState,
      }),
    ).toBe(resolve("kit-lokalny"));
  });
});
