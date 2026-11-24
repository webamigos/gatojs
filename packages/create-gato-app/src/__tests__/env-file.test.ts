import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  composeProjectName,
  randomSuffix,
  readEnvValue,
  setEnvValues,
  wizardEnvValues,
} from "../env-file.js";

describe("setEnvValues", () => {
  it.each([
    ["A=1\nB=2\n", { B: "x" }, "A=1\nB=x\n"],
    ["A=1\n", { C: "3" }, "A=1\nC=3\n"],
    ["A=1", { C: "3" }, "A=1\nC=3\n"],
    ["BB=2\n# B=old\n", { B: "x" }, "BB=2\n# B=old\nB=x\n"],
    ["B=1\n", { B: "$&$1" }, "B=$&$1\n"],
    ["B=1\n", { B: "$`$'" }, "B=$`$'\n"],
    ["AB=1\nB=2\nBA=3\n", { B: "x" }, "AB=1\nB=x\nBA=3\n"],
    ["A=1\nB=2\n", { A: "a", B: "b" }, "A=a\nB=b\n"],
    ["A=1\n", { B: "b", C: "c" }, "A=1\nB=b\nC=c\n"],
    ["", { A: "1" }, "A=1\n"],
  ])("%j z %j daje %j", (text, values, expected) => {
    expect(setEnvValues(text, values)).toBe(expected);
  });

  const key = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,8}$/).filter((candidate) => candidate !== "TARGET");
  const value = fc.stringMatching(/^[a-z0-9/+=:.-]{0,12}$/);
  const line = fc.oneof(
    fc.tuple(key, value).map(([k, v]) => `${k}=${v}`),
    fc.stringMatching(/^# [A-Za-z0-9=_ ]{0,12}$/),
    fc.constant(""),
    fc.constant("TARGETX=keep"),
    fc.constant("# TARGET=comment"),
  );

  test.prop([fc.array(line, { maxLength: 12 }), fc.stringMatching(/^[A-Za-z0-9$&`'/+=-]{0,16}$/)])(
    "dopisanie nowego klucza nie zmienia pozostałych linii",
    (lines, newValue) => {
      const text = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
      expect(setEnvValues(text, { TARGET: newValue })).toBe(`${text}TARGET=${newValue}\n`);
    },
  );

  test.prop([
    fc.array(line, { maxLength: 6 }),
    fc.array(line, { maxLength: 6 }),
    fc.stringMatching(/^[A-Za-z0-9$&`'/+=-]{0,16}$/),
  ])("zamiana istniejącego klucza zmienia tylko jego linię", (before, after, newValue) => {
    const text = `${[...before, "TARGET=old", ...after].join("\n")}\n`;
    const result = setEnvValues(text, { TARGET: newValue });
    expect(result).toBe(`${[...before, `TARGET=${newValue}`, ...after].join("\n")}\n`);
    expect(readEnvValue(result, "TARGET")).toBe(newValue);
  });
});

describe("readEnvValue", () => {
  it("czyta wartość klucza", () => {
    expect(readEnvValue("A=1\nB=two\n", "B")).toBe("two");
  });

  it("brak klucza daje null", () => {
    expect(readEnvValue("A=1\n", "B")).toBeNull();
  });

  it("klucz z tym samym przedrostkiem nie pasuje", () => {
    expect(readEnvValue("BB=2", "B")).toBeNull();
    expect(readEnvValue("AB=2\n", "B")).toBeNull();
  });

  it("zakomentowana linia nie pasuje", () => {
    expect(readEnvValue("# B=old\n", "B")).toBeNull();
  });

  it("pusta wartość to pusty napis", () => {
    expect(readEnvValue("ADMIN_EMAIL=\n", "ADMIN_EMAIL")).toBe("");
  });
});

describe("randomSuffix", () => {
  it("bajty mapuje na litery i cyfry modulo 36", () => {
    expect(randomSuffix(Uint8Array.from([0, 1, 2, 35, 36, 255]))).toBe("abc9ad");
  });

  it("25 i 26 to granica liter i cyfr", () => {
    expect(randomSuffix(Uint8Array.from([25, 26, 27, 34, 71, 72]))).toBe("z0189a");
  });

  test.prop([fc.uint8Array({ minLength: 6, maxLength: 6 })])(
    "dowolne 6 bajtów daje 6 znaków z [a-z0-9]",
    (bytes) => {
      expect(randomSuffix(bytes)).toMatch(/^[a-z0-9]{6}$/);
    },
  );
});

describe("composeProjectName", () => {
  it("łączy slug i przyrostek myślnikiem", () => {
    expect(composeProjectName("acme-shop", "abc9ad")).toBe("acme-shop-abc9ad");
  });
});

describe("wizardEnvValues", () => {
  it("bez COMPOSE_PROJECT_NAME i bez magazynu ustawia tylko nazwę projektu compose", () => {
    expect(
      wizardEnvValues({ existing: "A=1\n", slug: "acme-shop", suffix: "abc9ad", storage: null }),
    ).toStrictEqual({ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad" });
  });

  it("istniejący COMPOSE_PROJECT_NAME nie jest generowany od nowa", () => {
    expect(
      wizardEnvValues({
        existing: "A=1\nCOMPOSE_PROJECT_NAME=old\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: null,
      }),
    ).toStrictEqual({});
  });

  it("klucz z tym samym przyrostkiem nie liczy się jako COMPOSE_PROJECT_NAME", () => {
    expect(
      wizardEnvValues({
        existing: "MY_COMPOSE_PROJECT_NAME=old\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: null,
      }),
    ).toStrictEqual({ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad" });
  });

  it("magazyn lokalny dokłada STORAGE_PROVIDER=local", () => {
    expect(
      wizardEnvValues({
        existing: "",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: { provider: "local" },
      }),
    ).toStrictEqual({ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad", STORAGE_PROVIDER: "local" });
  });

  it("S3 dokłada dostawcę, endpoint i oba klucze z odpowiedzi", () => {
    expect(
      wizardEnvValues({
        existing: "COMPOSE_PROJECT_NAME=keep\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: {
          provider: "s3",
          endpoint: "https://s3.example.com",
          accessKeyId: "AK",
          secretAccessKey: "SK/+=",
          localMinio: false,
        },
      }),
    ).toStrictEqual({
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: "https://s3.example.com",
      S3_ACCESS_KEY_ID: "AK",
      S3_SECRET_ACCESS_KEY: "SK/+=",
    });
  });
});
