import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { uploadFormSchema } from "../upload.schemas";

function parseWithName(name: string) {
  return uploadFormSchema.safeParse({
    file: new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }),
    purpose: "editor-image",
  });
}

describe("uploadFormSchema nazwa pliku", () => {
  it("przyjmuje nazwę o długości dokładnie 255 znaków", () => {
    const name = `${"a".repeat(251)}.png`;

    expect(name.length).toBe(255);
    expect(parseWithName(name).success).toBe(true);
  });

  it("odrzuca nazwę o długości 256 znaków", () => {
    const name = `${"a".repeat(252)}.png`;

    expect(name.length).toBe(256);
    expect(parseWithName(name).success).toBe(false);
  });

  it("odrzuca pustą nazwę pliku", () => {
    expect(parseWithName("").success).toBe(false);
  });

  it("przyjmuje jednoznakową nazwę pliku", () => {
    expect(parseWithName("a").success).toBe(true);
  });

  it("liczy długość jako string.length, więc 128 emoji (256 jednostek UTF-16) odpada", () => {
    const name = "😀".repeat(128);

    expect(name.length).toBe(256);
    expect(parseWithName(name).success).toBe(false);
  });

  it("127 emoji i jeden znak (255 jednostek UTF-16) przechodzi", () => {
    const name = `${"😀".repeat(127)}a`;

    expect(name.length).toBe(255);
    expect(parseWithName(name).success).toBe(true);
  });

  test.prop([fc.string({ minLength: 1, maxLength: 255 })])(
    "każda nazwa od 1 do 255 znaków ASCII jest przyjęta",
    (name) => {
      expect(parseWithName(name).success).toBe(true);
    },
  );

  test.prop([fc.string({ minLength: 256, maxLength: 600 })])(
    "każda nazwa dłuższa niż 255 znaków ASCII jest odrzucona",
    (name) => {
      expect(parseWithName(name).success).toBe(false);
    },
  );

  it("nadal odrzuca pusty cel przy poprawnej nazwie", () => {
    const result = uploadFormSchema.safeParse({
      file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
      purpose: "",
    });

    expect(result.success).toBe(false);
  });
});
