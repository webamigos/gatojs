import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { normalizeAttributes } from "../index";

const primitiveValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
);

const attributeKey = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,20}$/);

describe("normalizeAttributes", () => {
  it("no argument → empty object", () => {
    expect(normalizeAttributes()).toStrictEqual({});
    expect(normalizeAttributes(undefined)).toStrictEqual({});
  });

  it("empty object → empty object", () => {
    expect(normalizeAttributes({})).toStrictEqual({});
  });

  it("null and undefined values are skipped, other keys stay", () => {
    expect(
      normalizeAttributes({ missing: null, absent: undefined, kept: 1 }),
    ).toStrictEqual({ kept: 1 });
  });

  it("strings, numbers and booleans are kept as-is, falsy ones included", () => {
    expect(
      normalizeAttributes({
        text: "hello",
        empty: "",
        zero: 0,
        negative: -1.5,
        yes: true,
        no: false,
      }),
    ).toStrictEqual({
      text: "hello",
      empty: "",
      zero: 0,
      negative: -1.5,
      yes: true,
      no: false,
    });
  });

  it("Error → <key>.type, <key>.message and <key>.stacktrace without the original key", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at handler (src/app/api/route.ts:12:5)";

    expect(normalizeAttributes({ err: error })).toStrictEqual({
      "err.type": "Error",
      "err.message": "boom",
      "err.stacktrace":
        "Error: boom\n    at handler (src/app/api/route.ts:12:5)",
    });
  });

  it("Error with an empty stack → no <key>.stacktrace", () => {
    const error = new Error("boom");
    error.stack = "";

    expect(normalizeAttributes({ cause: error })).toStrictEqual({
      "cause.type": "Error",
      "cause.message": "boom",
    });
  });

  it("Error without a stack → no <key>.stacktrace", () => {
    const error = new Error("boom");
    error.stack = undefined;

    expect(normalizeAttributes({ cause: error })).toStrictEqual({
      "cause.type": "Error",
      "cause.message": "boom",
    });
  });

  it("class minified to d with name set in the constructor → <key>.type is the name", () => {
    class d extends Error {
      constructor() {
        super("User is not a member of the active organization");
        this.name = "NoOrganizationError";
      }
    }

    const attributes = normalizeAttributes({ err: new d() });

    expect(attributes["err.type"]).toBe("NoOrganizationError");
    expect(attributes["err.message"]).toBe(
      "User is not a member of the active organization",
    );
  });

  it('class without its own name (inherits "Error") → <key>.type is the class name', () => {
    class ResourceNotFoundError extends Error {}

    const attributes = normalizeAttributes({
      err: new ResourceNotFoundError("Resource not found"),
    });

    expect(attributes["err.type"]).toBe("ResourceNotFoundError");
  });

  it('TypeError → <key>.type "TypeError"', () => {
    const attributes = normalizeAttributes({ err: new TypeError("bad input") });

    expect(attributes["err.type"]).toBe("TypeError");
  });

  it("name set to an empty string → <key>.type is the class name", () => {
    class EmptyNameError extends Error {
      constructor() {
        super("Error with an empty name");
        this.name = "";
      }
    }

    const attributes = normalizeAttributes({ err: new EmptyNameError() });

    expect(attributes["err.type"]).toBe("EmptyNameError");
  });

  it("name that is not a string → <key>.type is the class name", () => {
    class NumericNameError extends Error {
      constructor() {
        super("Error with a numeric name");
        Object.defineProperty(this, "name", { value: 42 });
      }
    }

    const attributes = normalizeAttributes({ err: new NumericNameError() });

    expect(attributes["err.type"]).toBe("NumericNameError");
  });

  it('anonymous class without its own name → <key>.type "Error", not an empty string', () => {
    const AnonymousError = (() => class extends Error {})();
    expect(AnonymousError.name).toBe("");

    const attributes = normalizeAttributes({
      err: new AnonymousError("Anonymous class error"),
    });

    expect(attributes["err.type"]).toBe("Error");
  });

  it("valid Date → ISO string", () => {
    expect(
      normalizeAttributes({ at: new Date("2026-11-23T10:15:30.123Z") }),
    ).toStrictEqual({ at: "2026-11-23T10:15:30.123Z" });
  });

  it('invalid Date → "Invalid Date"', () => {
    expect(normalizeAttributes({ at: new Date("not a date") })).toStrictEqual({
      at: "Invalid Date",
    });
  });

  it("plain object and array → JSON string", () => {
    expect(
      normalizeAttributes({
        filter: { status: "active", page: 2 },
        ids: [1, "a"],
      }),
    ).toStrictEqual({
      filter: '{"status":"active","page":2}',
      ids: '[1,"a"]',
    });
  });

  it("circular object → its String() form", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    expect(normalizeAttributes({ payload: circular })).toStrictEqual({
      payload: "[object Object]",
    });
  });

  it("bigint that JSON cannot serialize → its String() form", () => {
    expect(normalizeAttributes({ total: 10n })).toStrictEqual({ total: "10" });
  });

  test.prop([
    fc.dictionary(attributeKey, primitiveValue, { noNullPrototype: true }),
  ])(
    "any record of strings, numbers and booleans is returned unchanged",
    (attributes) => {
      expect(normalizeAttributes(attributes)).toStrictEqual(attributes);
    },
  );

  test.prop([
    fc.dictionary(
      attributeKey,
      fc.oneof(primitiveValue, fc.constant(null), fc.constant(undefined)),
      { noNullPrototype: true },
    ),
  ])("keys with null or undefined never appear in the result", (attributes) => {
    const result = normalizeAttributes(attributes);

    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) {
        expect(result).not.toHaveProperty([key]);
      } else {
        expect(result[key]).toBe(value);
      }
    }
  });

  test.prop([fc.date({ noInvalidDate: true })])(
    "any valid Date → toISOString()",
    (date) => {
      expect(normalizeAttributes({ at: date })).toStrictEqual({
        at: date.toISOString(),
      });
    },
  );

  test.prop([
    fc.stringMatching(/^[A-Za-z]\w{0,40}$/).filter((name) => name !== "Error"),
  ])(
    'any non-empty name other than "Error" → <key>.type is the name, not the class name',
    (name) => {
      const error = new Error("Operation rejected");
      error.name = name;

      expect(normalizeAttributes({ err: error })["err.type"]).toBe(name);
    },
  );

  test.prop([fc.stringMatching(/^[A-Za-z]\w{0,40}$/)])(
    "class with any name and no own name → <key>.type is the class name",
    (className) => {
      const NamedError = { [className]: class extends Error {} }[className];

      expect(
        normalizeAttributes({ err: new NamedError("Operation rejected") })[
          "err.type"
        ],
      ).toBe(className);
    },
  );
});
