import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allOrNone, requiredForProvider } from "../index";

const twoVars = z
  .object({ A: z.string().optional(), B: z.string().optional() })
  .superRefine(allOrNone(["A", "B"], "Demo"));

const threeVars = z
  .object({
    A: z.string().optional(),
    B: z.string().optional(),
    C: z.string().optional(),
  })
  .superRefine(allOrNone(["A", "B", "C"], "Mail"));

const anyValues = z
  .object({ A: z.unknown().optional(), B: z.unknown().optional() })
  .superRefine(allOrNone(["A", "B"], "Demo"));

const storage = z
  .object({
    STORAGE_PROVIDER: z.string().optional(),
    S3_BUCKET: z.string().optional(),
  })
  .superRefine(requiredForProvider("STORAGE_PROVIDER", "s3", ["S3_BUCKET"]));

const storageTwoNames = z
  .object({
    STORAGE_PROVIDER: z.unknown().optional(),
    S3_BUCKET: z.unknown().optional(),
    S3_ENDPOINT: z.unknown().optional(),
  })
  .superRefine(
    requiredForProvider("STORAGE_PROVIDER", "s3", ["S3_BUCKET", "S3_ENDPOINT"]),
  );

describe("allOrNone", () => {
  it.each([
    ["none set", {}],
    ["both set", { A: "x", B: "y" }],
    ["both empty", { A: "", B: "" }],
    ["both whitespace-only", { A: "  ", B: "\t" }],
  ])("%s → no issue", (_, source) => {
    expect(twoVars.safeParse(source).success).toBe(true);
  });

  it("only the first set → one issue on the first name, naming both and the missing one", () => {
    const result = twoVars.safeParse({ A: "x" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      {
        code: "custom",
        path: ["A"],
        message:
          "Demo is half-configured: A, B must all be set or all be omitted (missing: B)",
      },
    ]);
  });

  it("only the second set → the issue is still on the first name, with the first one missing", () => {
    const result = twoVars.safeParse({ B: "y" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Demo is half-configured: A, B must all be set or all be omitted (missing: A)",
      },
    ]);
  });

  it("a whitespace-only value counts as unset", () => {
    const result = twoVars.safeParse({ A: "x", B: "   " });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Demo is half-configured: A, B must all be set or all be omitted (missing: B)",
      },
    ]);
  });

  it("a value that is not a string counts as unset", () => {
    const result = anyValues.safeParse({ A: "x", B: 5 });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Demo is half-configured: A, B must all be set or all be omitted (missing: B)",
      },
    ]);
  });

  it("one of three set → one issue listing both missing names in order", () => {
    const result = threeVars.safeParse({ A: "x" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Mail is half-configured: A, B, C must all be set or all be omitted (missing: B, C)",
      },
    ]);
  });

  it("two of three set → one issue with the last name missing", () => {
    const result = threeVars.safeParse({ A: "x", B: "y" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Mail is half-configured: A, B, C must all be set or all be omitted (missing: C)",
      },
    ]);
  });

  it("only the middle of three set → one issue with the outer names missing", () => {
    const result = threeVars.safeParse({ B: "y" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["A"],
        message:
          "Mail is half-configured: A, B, C must all be set or all be omitted (missing: A, C)",
      },
    ]);
  });

  it("all three set → no issue", () => {
    expect(threeVars.safeParse({ A: "x", B: "y", C: "z" }).success).toBe(true);
  });

  it("the label comes from the argument", () => {
    const result = z
      .object({ X: z.string().optional(), Y: z.string().optional() })
      .superRefine(allOrNone(["X", "Y"], "SMTP"))
      .safeParse({ Y: "y" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["X"],
        message:
          "SMTP is half-configured: X, Y must all be set or all be omitted (missing: X)",
      },
    ]);
  });
});

describe("requiredForProvider", () => {
  it("the matching provider without the variable → an issue on that variable", () => {
    const result = storage.safeParse({ STORAGE_PROVIDER: "s3" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      {
        code: "custom",
        path: ["S3_BUCKET"],
        message: 'S3_BUCKET is required when STORAGE_PROVIDER is "s3"',
      },
    ]);
  });

  it("the provider value is trimmed and lowercased before comparing", () => {
    expect(
      storage.safeParse({ STORAGE_PROVIDER: " S3 " }).error?.issues,
    ).toMatchObject([
      {
        path: ["S3_BUCKET"],
        message: 'S3_BUCKET is required when STORAGE_PROVIDER is "s3"',
      },
    ]);
  });

  it.each([
    ["another provider", { STORAGE_PROVIDER: "local" }],
    ["a provider that only starts with the value", { STORAGE_PROVIDER: "s3x" }],
    ["a provider that only contains the value", { STORAGE_PROVIDER: "mys3" }],
    ["no provider", {}],
    ["an empty provider", { STORAGE_PROVIDER: "" }],
  ])("%s → no issue", (_, source) => {
    expect(storage.safeParse(source).success).toBe(true);
  });

  it("the matching provider with the variable set → no issue", () => {
    expect(
      storage.safeParse({ STORAGE_PROVIDER: "s3", S3_BUCKET: "b" }).success,
    ).toBe(true);
  });

  it("a whitespace-only variable counts as unset", () => {
    expect(
      storage.safeParse({ STORAGE_PROVIDER: "s3", S3_BUCKET: "   " }).error
        ?.issues,
    ).toMatchObject([{ path: ["S3_BUCKET"] }]);
  });

  it("two missing names → two issues in the order of the names", () => {
    const result = storageTwoNames.safeParse({ STORAGE_PROVIDER: "s3" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["S3_BUCKET"],
        message: 'S3_BUCKET is required when STORAGE_PROVIDER is "s3"',
      },
      {
        path: ["S3_ENDPOINT"],
        message: 'S3_ENDPOINT is required when STORAGE_PROVIDER is "s3"',
      },
    ]);
  });

  it("only the unset name gets an issue", () => {
    const result = storageTwoNames.safeParse({
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "b",
      S3_ENDPOINT: 9000,
    });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["S3_ENDPOINT"],
        message: 'S3_ENDPOINT is required when STORAGE_PROVIDER is "s3"',
      },
    ]);
  });

  it("a provider that is not a string → no issue", () => {
    expect(storageTwoNames.safeParse({ STORAGE_PROVIDER: 3 }).success).toBe(
      true,
    );
  });

  it("the provider variable and value come from the arguments", () => {
    const result = z
      .object({
        MAIL_PROVIDER: z.string().optional(),
        SMTP_URL: z.string().optional(),
      })
      .superRefine(requiredForProvider("MAIL_PROVIDER", "smtp", ["SMTP_URL"]))
      .safeParse({ MAIL_PROVIDER: "SMTP" });

    expect(result.error?.issues).toMatchObject([
      {
        path: ["SMTP_URL"],
        message: 'SMTP_URL is required when MAIL_PROVIDER is "smtp"',
      },
    ]);
  });
});
