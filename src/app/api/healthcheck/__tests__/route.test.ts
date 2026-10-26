import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import { GET } from "@/app/api/healthcheck/route";

describe("GET /api/healthcheck", () => {
  it("200 gdy baza odpowiada", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("healthcheck 503 gdy baza nie odpowiada", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", db: "error" });
  });
});
