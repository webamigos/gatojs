import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { UserTableCellProps } from "@/features/users/contracts/user-account.types";
import type { SlotContribution } from "../slots";
import {
  defineColumnContribution,
  isColumnContribution,
} from "../column-slots";

function ScoreCell(props: UserTableCellProps) {
  return `${props.row.id} ${props.organizationId}`;
}

function RowActionOnly(props: { userId: string; organizationId: string }) {
  return props.userId;
}

const cell = () => Promise.resolve({ default: ScoreCell });

const noPropsCell = () => Promise.resolve({ default: () => null });

const BASE: SlotContribution = {
  slot: "users.table.columns",
  id: "crm.score",
  priority: 10,
  roles: undefined,
  component: () => Promise.resolve({ default: () => null }),
};

describe("defineColumnContribution", () => {
  it("returns the slot, id, priority, roles, header and the cell loader as component", () => {
    expect(
      defineColumnContribution("users.table.columns", {
        id: "crm.score",
        priority: 10,
        header: "col-score",
        cell,
      }),
    ).toEqual({
      slot: "users.table.columns",
      id: "crm.score",
      priority: 10,
      roles: undefined,
      header: "col-score",
      component: cell,
    });
  });

  it("keeps the given roles", () => {
    expect(
      defineColumnContribution("users.table.columns", {
        id: "crm.stage",
        priority: 3,
        roles: ["owner", "admin"],
        header: "col-stage",
        cell,
      }),
    ).toEqual({
      slot: "users.table.columns",
      id: "crm.stage",
      priority: 3,
      roles: ["owner", "admin"],
      header: "col-stage",
      component: cell,
    });
  });

  it("the cell loader is the component itself, not a wrapper", () => {
    const contribution = defineColumnContribution("users.table.columns", {
      id: "crm.score",
      priority: 10,
      header: "col-score",
      cell,
    });
    expect(contribution.component).toBe(cell);
  });

  it("a defined column contribution is a column contribution", () => {
    expect(
      isColumnContribution(
        defineColumnContribution("users.table.columns", {
          id: "crm.score",
          priority: 10,
          header: "col-score",
          cell,
        }),
      ),
    ).toBe(true);
  });

  it("a cell with props of another slot and a server slot id are type errors", () => {
    const wrongCell = defineColumnContribution("users.table.columns", {
      id: "crm.wrong",
      priority: 1,
      header: "col-wrong",
      // @ts-expect-error a row-action component does not take the cell props
      cell: () => Promise.resolve({ default: RowActionOnly }),
    });
    const serverSlot = defineColumnContribution(
      // @ts-expect-error app.header.actions is a server slot
      "app.header.actions",
      {
        id: "crm.header",
        priority: 1,
        header: "col-header",
        cell: noPropsCell,
      },
    );
    expect([wrongCell.id, serverSlot.id]).toEqual(["crm.wrong", "crm.header"]);
  });
});

describe("isColumnContribution", () => {
  it("a contribution with header col-score is a column", () => {
    expect(isColumnContribution({ ...BASE, header: "col-score" })).toBe(true);
  });

  it("a contribution without header is not a column", () => {
    expect(isColumnContribution(BASE)).toBe(false);
  });

  it("a contribution with an empty header is not a column", () => {
    expect(isColumnContribution({ ...BASE, header: "" })).toBe(false);
  });

  it.each([[42], [null], [undefined], [true], [{ key: "col-score" }]])(
    "a contribution with header %s (not a string) is not a column",
    (header) => {
      expect(isColumnContribution({ ...BASE, header })).toBe(false);
    },
  );

  test.prop([fc.string({ minLength: 1 })])(
    "any non-empty string header makes a column",
    (header) => {
      expect(isColumnContribution({ ...BASE, header })).toBe(true);
    },
  );

  test.prop([
    fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.string({ minLength: 1 })),
      fc.dictionary(fc.string(), fc.string()),
    ),
  ])("any header that is not a string is not a column", (header) => {
    expect(isColumnContribution({ ...BASE, header })).toBe(false);
  });
});
