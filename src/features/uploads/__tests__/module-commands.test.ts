import { describe, expect, it } from "vitest";
import { events } from "../events";
import uploadsModule from "../module";

describe("uploads module commands and events", () => {
  it("module.ts declares exactly the uploads.delete command", () => {
    expect(uploadsModule.commands).toEqual(["uploads.delete"]);
  });

  it("events.ts declares only uploads.deleted", () => {
    expect(Object.keys(events)).toEqual(["uploads.deleted"]);
  });

  it("uploads.deleted carries { uploadId: string }", () => {
    expect(
      events["uploads.deleted"].safeParse({ uploadId: "upload-1" }),
    ).toMatchObject({ success: true, data: { uploadId: "upload-1" } });
  });

  it.each([{}, { uploadId: 5 }, { id: "upload-1" }])(
    "uploads.deleted rejects the payload %j",
    (payload) => {
      expect(events["uploads.deleted"].safeParse(payload).success).toBe(false);
    },
  );

  it("uploads.deleted does not declare organizationId", () => {
    expect(Object.keys(events["uploads.deleted"].shape)).toEqual(["uploadId"]);
  });
});
