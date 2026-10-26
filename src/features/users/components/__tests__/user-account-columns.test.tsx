import { describe, expect, it, vi } from "vitest";
import { pl } from "date-fns/locale";
import { buildUserAccountColumns } from "../user-account-columns";

const t = ((key: string) => `t:${key}`) as Parameters<
  typeof buildUserAccountColumns
>[0];

const columns = buildUserAccountColumns(t, pl, "me", null, vi.fn());
const dataColumns = columns.filter((column) => column.id !== "actions");

describe("buildUserAccountColumns", () => {
  it("etykietuje każdą kolumnę danych dla panelu widoczności", () => {
    expect(dataColumns).toHaveLength(4);
    dataColumns.forEach((column) => {
      expect(column.meta?.label).toMatch(/^t:col-/);
    });
  });

  it("etykieta i nagłówek są zgodne", () => {
    dataColumns.forEach((column) => {
      expect(column.meta?.label).toBe(column.header);
    });
  });

  it("kolumna akcji nie trafia do panelu widoczności", () => {
    const actions = columns.find((column) => column.id === "actions");
    expect(actions?.enableHiding).toBe(false);
  });
});
