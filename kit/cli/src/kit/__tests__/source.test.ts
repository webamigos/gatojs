import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import type { KitState } from "../../manifest/schema.js";
import { spawnRunner } from "../../process/runner.js";
import type { Runner } from "../../process/runner.js";
import { resolveKitSource } from "../source.js";

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
