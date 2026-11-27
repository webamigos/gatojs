import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillEnv } from "../env-file.ts";

describe("fillEnv", () => {
  it("fills empty and commented keys and leaves other lines alone", () => {
    assert.equal(
      fillEnv("A=\nB=keep\n# C=\nD=1", { A: "x", C: "y" }),
      "A=x\nB=keep\nC=y\nD=1",
    );
  });

  it("appends a key the example lacks", () => {
    assert.equal(fillEnv("A=1", { Z: "9" }), "A=1\nZ=9");
  });

  it("replaces only the first matching line and keeps a value containing =", () => {
    assert.equal(fillEnv("A=\nA=", { A: "p=q" }), "A=p=q\nA=");
  });

  it("does not touch a commented line that is prose", () => {
    assert.equal(fillEnv("# A note=", { A: "x" }), "# A note=\nA=x");
  });

  it("fills keys with underscores and digits", () => {
    assert.equal(
      fillEnv("APP_URL=\nS3_BUCKET_2=", { APP_URL: "u", S3_BUCKET_2: "b" }),
      "APP_URL=u\nS3_BUCKET_2=b",
    );
  });

  it("does not touch a prose comment that contains an assignment mid-line", () => {
    assert.equal(
      fillEnv("# Set A=1 for x", { A: "x" }),
      "# Set A=1 for x\nA=x",
    );
  });

  it("fills commented assignments with or without spaces after the hash", () => {
    assert.equal(fillEnv("#B=\n#  C=", { B: "y", C: "z" }), "B=y\nC=z");
  });

  it("returns the example unchanged when there are no values", () => {
    assert.equal(fillEnv("A=\nB=keep\n# C=\nD=1", {}), "A=\nB=keep\n# C=\nD=1");
  });
});
