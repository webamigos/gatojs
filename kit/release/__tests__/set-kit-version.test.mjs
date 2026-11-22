import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../set-kit-version.mjs", import.meta.url));

async function loadSetKitVersion() {
  const module = await import(scriptPath);
  return module.setKitVersion;
}

const kitJson = `{
  "version": "0.1.0",
  "repo": "https://github.com/webamigos/wa-kit.git",
  "kitOnly": ["kit/**", "docs/**"],
  "placeholders": {
    "projectName": "WA App"
  },
  "managedFiles": ["package.json", "package-lock.json"]
}
`;

const kitJsonAt020 = `{
  "version": "0.2.0",
  "repo": "https://github.com/webamigos/wa-kit.git",
  "kitOnly": ["kit/**", "docs/**"],
  "placeholders": {
    "projectName": "WA App"
  },
  "managedFiles": ["package.json", "package-lock.json"]
}
`;

describe("setKitVersion", () => {
  it("podmienia wersję najwyższego poziomu i zostawia resztę pliku bajt w bajt, z tablicami inline i końcowym znakiem nowej linii", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.equal(setKitVersion(kitJson, "0.2.0"), kitJsonAt020);
  });

  it("nie zmienia zagnieżdżonego klucza version, gdy stoi przed wersją najwyższego poziomu", async () => {
    const setKitVersion = await loadSetKitVersion();
    const input = `{
  "nested": {
    "version": "0.1.0"
  },
  "version": "0.1.0",
  "list": ["version", "0.1.0"]
}
`;
    const expected = `{
  "nested": {
    "version": "0.1.0"
  },
  "version": "1.0.0",
  "list": ["version", "0.1.0"]
}
`;
    assert.equal(setKitVersion(input, "1.0.0"), expected);
  });

  it("nie zmienia zagnieżdżonego klucza version, gdy stoi po wersji najwyższego poziomu", async () => {
    const setKitVersion = await loadSetKitVersion();
    const input = `{
  "version": "0.1.0",
  "nested": {
    "version": "0.1.0"
  }
}
`;
    const expected = `{
  "version": "0.3.1",
  "nested": {
    "version": "0.1.0"
  }
}
`;
    assert.equal(setKitVersion(input, "0.3.1"), expected);
  });

  it("nie myli klucza version z kluczem o podobnej nazwie ani z wartością \"version\"", async () => {
    const setKitVersion = await loadSetKitVersion();
    const input = `{
  "versionNote": "0.1.0",
  "label": "version",
  "version": "0.1.0"
}
`;
    const expected = `{
  "versionNote": "0.1.0",
  "label": "version",
  "version": "2.0.0"
}
`;
    assert.equal(setKitVersion(input, "2.0.0"), expected);
  });

  it("zachowuje zapis bez spacji w jednej linii", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.equal(
      setKitVersion('{"version":"0.1.0","nested":{"version":"0.1.0"}}', "0.2.0"),
      '{"version":"0.2.0","nested":{"version":"0.1.0"}}',
    );
  });

  it("przyjmuje wersję z prereleasem", async () => {
    const setKitVersion = await loadSetKitVersion();
    const result = setKitVersion(kitJson, "1.0.0-beta.1");
    assert.equal(result.split("\n")[1], '  "version": "1.0.0-beta.1",');
    assert.equal(JSON.parse(result).version, "1.0.0-beta.1");
  });

  it("przyjmuje wersję z metadanymi builda", async () => {
    const setKitVersion = await loadSetKitVersion();
    const result = setKitVersion(kitJson, "1.2.3+build.5");
    assert.equal(result.split("\n")[1], '  "version": "1.2.3+build.5",');
    assert.equal(JSON.parse(result).version, "1.2.3+build.5");
  });

  it("przyjmuje wielocyfrowe składniki wersji", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.equal(JSON.parse(setKitVersion(kitJson, "10.20.30")).version, "10.20.30");
  });

  it("zwraca identyczny tekst, gdy wersja się nie zmienia", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.equal(setKitVersion(kitJson, "0.1.0"), kitJson);
  });

  it("drugie wywołanie na wyniku pierwszego daje plik z drugą wersją", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.equal(setKitVersion(setKitVersion(kitJson, "9.9.9"), "0.2.0"), kitJsonAt020);
  });

  for (const invalid of [
    "v0.2.0",
    "0.2",
    "",
    "0.2.0 ",
    " 0.2.0",
    "0.2.0\n",
    "01.2.3",
    "0.02.0",
    "0.2.0.1",
    "0.2.0-",
    "latest",
    '0.2.0", "x": "y',
    "$&",
  ]) {
    it(`odrzuca niepoprawną wersję ${JSON.stringify(invalid)} błędem Invalid version`, async () => {
      const setKitVersion = await loadSetKitVersion();
      assert.throws(() => setKitVersion(kitJson, invalid), {
        name: "Error",
        message: /Invalid version/,
      });
    });
  }

  it("odrzuca wersję, która nie jest napisem", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.throws(() => setKitVersion(kitJson, undefined), /Invalid version/);
  });

  it("rzuca no top-level version, gdy wersja jest tylko w zagnieżdżonym obiekcie", async () => {
    const setKitVersion = await loadSetKitVersion();
    const input = `{
  "nested": {
    "version": "0.1.0"
  }
}
`;
    assert.throws(() => setKitVersion(input, "0.2.0"), {
      name: "Error",
      message: /no top-level version/,
    });
  });

  it("rzuca no top-level version, gdy wersja najwyższego poziomu jest liczbą", async () => {
    const setKitVersion = await loadSetKitVersion();
    const input = `{
  "version": 1,
  "nested": {
    "version": "0.1.0"
  }
}
`;
    assert.throws(() => setKitVersion(input, "0.2.0"), /no top-level version/);
  });

  it("rzuca no top-level version, gdy w obiekcie nie ma klucza version", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.throws(() => setKitVersion('{\n  "repo": "x"\n}\n', "0.2.0"), /no top-level version/);
  });

  it("rzuca błąd dla tekstu, który nie jest poprawnym JSON", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.throws(() => setKitVersion('{\n  "version": "0.1.0",\n', "0.2.0"));
  });

  it("rzuca błąd dla fragmentu z kluczem version, który nie jest dokumentem JSON", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.throws(() => setKitVersion('"version": "0.1.0"', "0.2.0"));
  });

  it("rzuca błąd, gdy dokument JSON jest tablicą, a nie obiektem", async () => {
    const setKitVersion = await loadSetKitVersion();
    assert.throws(() => setKitVersion('[{"version": "0.1.0"}]', "0.2.0"));
  });
});

describe("CLI set-kit-version.mjs", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "set-kit-version-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function runCli(args) {
    return spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: tempDir,
      encoding: "utf8",
    });
  }

  function writeDefaultKitJson(text) {
    mkdirSync(join(tempDir, "kit"));
    const path = join(tempDir, "kit", "kit.json");
    writeFileSync(path, text);
    return path;
  }

  it("bez ścieżki nadpisuje kit/kit.json względem katalogu roboczego i kończy się kodem 0", () => {
    const path = writeDefaultKitJson(kitJson);
    const result = runCli(["0.2.0"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(path, "utf8"), kitJsonAt020);
  });

  it("z bezwzględną ścieżką nadpisuje wskazany plik, a nie domyślny", () => {
    const defaultPath = writeDefaultKitJson(kitJson);
    const customPath = join(tempDir, "other.json");
    writeFileSync(customPath, kitJson);
    const result = runCli(["0.2.0", customPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(customPath, "utf8"), kitJsonAt020);
    assert.equal(readFileSync(defaultPath, "utf8"), kitJson);
  });

  it("ze ścieżką względną rozwiązuje ją względem katalogu roboczego", () => {
    const defaultPath = writeDefaultKitJson(kitJson);
    mkdirSync(join(tempDir, "custom"));
    const customPath = join(tempDir, "custom", "kit.json");
    writeFileSync(customPath, kitJson);
    const result = runCli(["0.2.0", "custom/kit.json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(customPath, "utf8"), kitJsonAt020);
    assert.equal(readFileSync(defaultPath, "utf8"), kitJson);
  });

  it("bez argumentu wersji kończy się kodem różnym od 0 i nie zmienia pliku", () => {
    const path = writeDefaultKitJson(kitJson);
    const result = runCli([]);
    assert.notEqual(result.status, 0);
    assert.notEqual(result.stderr.trim(), "");
    assert.equal(readFileSync(path, "utf8"), kitJson);
  });

  it("z wersją z prefiksem v kończy się kodem różnym od 0, wypisuje Invalid version na stderr i nie zmienia pliku", () => {
    const path = writeDefaultKitJson(kitJson);
    const result = runCli(["v0.2.0"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid version/);
    assert.equal(readFileSync(path, "utf8"), kitJson);
  });

  it("z niepoprawną wersją i jawną ścieżką nie zmienia wskazanego pliku", () => {
    const customPath = join(tempDir, "other.json");
    writeFileSync(customPath, kitJson);
    const result = runCli(["0.2", customPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid version/);
    assert.equal(readFileSync(customPath, "utf8"), kitJson);
  });

  it("dla pliku bez wersji najwyższego poziomu kończy się kodem różnym od 0 i nie zmienia pliku", () => {
    const original = '{\n  "nested": {\n    "version": "0.1.0"\n  }\n}\n';
    const path = writeDefaultKitJson(original);
    const result = runCli(["0.2.0"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no top-level version/);
    assert.equal(readFileSync(path, "utf8"), original);
  });

  it("gdy plik nie istnieje, kończy się kodem różnym od 0", () => {
    const result = runCli(["0.2.0"]);
    assert.notEqual(result.status, 0);
    assert.notEqual(result.stderr.trim(), "");
  });
});
