import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  generateSecret,
  generatedVariables,
  SECRET_KINDS,
  withGeneratedSecrets,
} from "../secrets.js";
import { manifestOf } from "./manifests.js";

function recordingBytes(fill: number) {
  const sizes: number[] = [];
  const randomBytes = (size: number): Uint8Array => {
    sizes.push(size);
    return new Uint8Array(size).fill(fill);
  };
  return { sizes, randomBytes };
}

function zeros(size: number): Uint8Array {
  return new Uint8Array(size);
}

const core = manifestOf("core");
const demo = manifestOf("demo", {
  env: [
    { name: "DEMO_TOKEN", example: "token" },
    {
      name: "DEMO_SECRET",
      example: "demo-secret-example",
      generate: "secret-64",
    },
  ],
});

describe("SECRET_KINDS", () => {
  it("wymienia trzy rodzaje sekretów z planu", () => {
    expect([...SECRET_KINDS]).toEqual(["secret-32", "secret-64", "hex-32"]);
  });
});

describe("generateSecret", () => {
  it("secret-32 z zerowych bajtów daje 43 znaki A", () => {
    expect(generateSecret("secret-32", zeros)).toBe("A".repeat(43));
  });

  it("secret-64 z zerowych bajtów daje 86 znaków A", () => {
    expect(generateSecret("secret-64", zeros)).toBe("A".repeat(86));
  });

  it("hex-32 z zerowych bajtów daje 64 zera", () => {
    expect(generateSecret("hex-32", zeros)).toBe("0".repeat(64));
  });

  it("hex-32 z bajtów 255 daje 64 małe litery f", () => {
    expect(generateSecret("hex-32", recordingBytes(255).randomBytes)).toBe(
      "f".repeat(64),
    );
  });

  it("secret-32 z bajtów 255 daje base64url bez dopełnienia: 42 podkreślniki i 8", () => {
    expect(generateSecret("secret-32", recordingBytes(255).randomBytes)).toBe(
      `${"_".repeat(42)}8`,
    );
  });

  it("secret-64 z bajtów 255 daje 85 podkreślników i w, bez dopełnienia ani + i /", () => {
    expect(generateSecret("secret-64", recordingBytes(255).randomBytes)).toBe(
      `${"_".repeat(85)}w`,
    );
  });

  it("hex-32 z bajtów 0xab daje ab powtórzone 32 razy", () => {
    expect(generateSecret("hex-32", recordingBytes(0xab).randomBytes)).toBe(
      "ab".repeat(32),
    );
  });

  it("prosi o 32, 64 i 32 bajty dla secret-32, secret-64 i hex-32", () => {
    const { sizes, randomBytes } = recordingBytes(0);
    generateSecret("secret-32", randomBytes);
    generateSecret("secret-64", randomBytes);
    generateSecret("hex-32", randomBytes);
    expect(sizes).toEqual([32, 64, 32]);
  });

  test.prop([fc.uint8Array({ minLength: 32, maxLength: 32 })])(
    "secret-32 z dowolnych bajtów ma 43 znaki base64url",
    (bytes) => {
      expect(generateSecret("secret-32", () => bytes)).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );
    },
  );

  test.prop([fc.uint8Array({ minLength: 64, maxLength: 64 })])(
    "secret-64 z dowolnych bajtów ma 86 znaków base64url",
    (bytes) => {
      expect(generateSecret("secret-64", () => bytes)).toMatch(
        /^[A-Za-z0-9_-]{86}$/,
      );
    },
  );

  test.prop([fc.uint8Array({ minLength: 32, maxLength: 32 })])(
    "hex-32 z dowolnych bajtów ma 64 małe znaki szesnastkowe i odtwarza bajty",
    (bytes) => {
      const secret = generateSecret("hex-32", () => bytes);
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      expect(Uint8Array.from(Buffer.from(secret, "hex"))).toEqual(bytes);
    },
  );

  test.prop([fc.uint8Array({ minLength: 32, maxLength: 32 })])(
    "secret-32 dekodowany jako base64url odtwarza bajty",
    (bytes) => {
      const secret = generateSecret("secret-32", () => bytes);
      expect(Uint8Array.from(Buffer.from(secret, "base64url"))).toEqual(bytes);
    },
  );
});

describe("generatedVariables", () => {
  it("core i demo: BETTER_AUTH_SECRET jako secret-32, potem DEMO_SECRET, bez DEMO_TOKEN", () => {
    expect(generatedVariables([core, demo])).toEqual([
      { name: "BETTER_AUTH_SECRET", kind: "secret-32" },
      { name: "DEMO_SECRET", kind: "secret-64" },
    ]);
  });

  it("bez manifestów zostaje sam BETTER_AUTH_SECRET", () => {
    expect(generatedVariables([])).toEqual([
      { name: "BETTER_AUTH_SECRET", kind: "secret-32" },
    ]);
  });

  it("manifest z BETTER_AUTH_SECRET nie dubluje zmiennej", () => {
    const withAuthSecret = manifestOf("auth-extra", {
      env: [
        { name: "BETTER_AUTH_SECRET", example: "x", generate: "secret-32" },
        { name: "ENCRYPTION_MASTER_KEY", example: "y", generate: "hex-32" },
      ],
    });
    expect(generatedVariables([core, withAuthSecret, demo])).toEqual([
      { name: "BETTER_AUTH_SECRET", kind: "secret-32" },
      { name: "ENCRYPTION_MASTER_KEY", kind: "hex-32" },
      { name: "DEMO_SECRET", kind: "secret-64" },
    ]);
  });

  it("zmienna bez generate nie trafia na listę", () => {
    const plain = manifestOf("plain", {
      env: [{ name: "PLAIN", example: "p", required: true }],
    });
    expect(generatedVariables([plain])).toEqual([
      { name: "BETTER_AUTH_SECRET", kind: "secret-32" },
    ]);
  });
});

describe("withGeneratedSecrets", () => {
  const demoSecret = [{ name: "DEMO_SECRET", kind: "secret-64" as const }];

  it("podmienia wartość przykładową na sekret z bajtów", () => {
    expect(
      withGeneratedSecrets("A=1\nDEMO_SECRET=example\n", demoSecret, zeros),
    ).toBe(`A=1\nDEMO_SECRET=${"A".repeat(86)}\n`);
  });

  it("zmiennej spoza tekstu nie dopisuje", () => {
    expect(withGeneratedSecrets("A=1\n", demoSecret, zeros)).toBe("A=1\n");
  });

  it("zakomentowana linia zostaje nietknięta", () => {
    expect(
      withGeneratedSecrets(
        "# DEMO_SECRET=x\nDEMO_SECRET=example\n",
        demoSecret,
        zeros,
      ),
    ).toBe(`# DEMO_SECRET=x\nDEMO_SECRET=${"A".repeat(86)}\n`);
  });

  it("zakomentowana linia bez aktywnej zostaje bez zmian", () => {
    expect(withGeneratedSecrets("# DEMO_SECRET=x\n", demoSecret, zeros)).toBe(
      "# DEMO_SECRET=x\n",
    );
  });

  it("klucz z tym samym przedrostkiem nie jest podmieniony", () => {
    expect(
      withGeneratedSecrets(
        "XDEMO_SECRET=keep\nDEMO_SECRET_OLD=keep\nDEMO_SECRET=example\n",
        demoSecret,
        zeros,
      ),
    ).toBe(
      `XDEMO_SECRET=keep\nDEMO_SECRET_OLD=keep\nDEMO_SECRET=${"A".repeat(86)}\n`,
    );
  });

  it("każda zmienna dostaje sekret swojego rodzaju", () => {
    expect(
      withGeneratedSecrets(
        "BETTER_AUTH_SECRET=change-me\nKEY=k\nDEMO_SECRET=example\n",
        [
          { name: "BETTER_AUTH_SECRET", kind: "secret-32" },
          { name: "KEY", kind: "hex-32" },
          { name: "DEMO_SECRET", kind: "secret-64" },
        ],
        zeros,
      ),
    ).toBe(
      `BETTER_AUTH_SECRET=${"A".repeat(43)}\nKEY=${"0".repeat(64)}\nDEMO_SECRET=${"A".repeat(86)}\n`,
    );
  });

  it("przykład ze znakami $& jest zastąpiony w całości, inne linie zostają", () => {
    expect(
      withGeneratedSecrets("DEMO_SECRET=$&$1\nB=$&\n", demoSecret, zeros),
    ).toBe(`DEMO_SECRET=${"A".repeat(86)}\nB=$&\n`);
  });

  it("pusta lista zmiennych zostawia tekst bez zmian", () => {
    expect(withGeneratedSecrets("A=1\nDEMO_SECRET=example\n", [], zeros)).toBe(
      "A=1\nDEMO_SECRET=example\n",
    );
  });
});
