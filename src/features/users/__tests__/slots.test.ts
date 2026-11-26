import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyGatoConfig } from "@/shared/lib/modules/gato-config";
import {
  slotRegistry,
  SlotError,
  type SlotContribution,
} from "@/shared/lib/modules/slots";
import * as usersSlots from "../slots";
import { slotDefinitions } from "../slots";

const SCORE: SlotContribution = {
  slot: "users.table.columns",
  id: "crm.score",
  priority: 10,
  roles: undefined,
  component: () => Promise.resolve({ default: () => null }),
};

describe("users slot definitions", () => {
  it("declares the two client slots of the users table", () => {
    expect(slotDefinitions).toEqual([
      { id: "users.table.row-actions", kind: "client" },
      { id: "users.table.columns", kind: "client" },
    ]);
  });

  it("a client contribution of another module to users.table.columns is registered", () => {
    expect(
      slotRegistry(
        {
          slots: [{ module: "users", value: usersSlots }],
          clientSlots: [{ module: "crm", value: { clientSlots: [SCORE] } }],
        },
        emptyGatoConfig,
      ),
    ).toEqual([{ ...SCORE, module: "crm", kind: "client" }]);
  });

  it("a server contribution to users.table.row-actions is rejected", () => {
    expect(() =>
      slotRegistry(
        {
          slots: [
            { module: "users", value: usersSlots },
            {
              module: "crm",
              value: {
                slots: [
                  { ...SCORE, slot: "users.table.row-actions", id: "crm.act" },
                ],
              },
            },
          ],
          clientSlots: [],
        },
        emptyGatoConfig,
      ),
    ).toThrow(SlotError);
  });

  it("the generated server registry loads the users slots", () => {
    const generated = readFileSync(
      path.resolve(process.cwd(), "src/modules.generated.ts"),
      "utf8",
    );
    expect(generated).toContain('from "@/features/users/slots"');
  });
});
