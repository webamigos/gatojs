import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: [],
  moduleSetups: [],
}));

import { OrganizationSetupError } from "@/shared/lib/modules/setup";
import { setupOrganizationsCommand } from "../setup-organizations";

type Deps = Parameters<typeof setupOrganizationsCommand>[1];
type MissingSetup = { organizationId: string; module: string };

const ORG_B_NOTES: MissingSetup = { organizationId: "org-b", module: "notes" };
const ORG_A_TASKS: MissingSetup = { organizationId: "org-a", module: "tasks" };

let missing: ReturnType<typeof vi.fn>;
let run: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.fn<(line: string) => void>>;
let error: ReturnType<typeof vi.fn<(line: string) => void>>;

function deps(): Deps {
  return { missing, run, log, error } as unknown as Deps;
}

beforeEach(() => {
  missing = vi.fn(async (): Promise<MissingSetup[]> => []);
  run = vi.fn(
    async (): Promise<{ ran: MissingSetup[]; failed: MissingSetup[] }> => ({
      ran: [],
      failed: [],
    }),
  );
  log = vi.fn<(line: string) => void>();
  error = vi.fn<(line: string) => void>();
});

describe("setupOrganizationsCommand --check", () => {
  it("prints each missing pair and exits 1", async () => {
    missing.mockResolvedValue([ORG_B_NOTES]);

    await expect(setupOrganizationsCommand(["--check"], deps())).resolves.toBe(
      1,
    );
    expect(log.mock.calls).toEqual([["org-b notes"]]);
    expect(error).not.toHaveBeenCalled();
  });

  it("prints several missing pairs in the order they come", async () => {
    missing.mockResolvedValue([ORG_A_TASKS, ORG_B_NOTES]);

    await expect(setupOrganizationsCommand(["--check"], deps())).resolves.toBe(
      1,
    );
    expect(log.mock.calls).toEqual([["org-a tasks"], ["org-b notes"]]);
  });

  it("with nothing missing prints All organizations are set up and exits 0", async () => {
    await expect(setupOrganizationsCommand(["--check"], deps())).resolves.toBe(
      0,
    );
    expect(log.mock.calls).toEqual([["All organizations are set up"]]);
  });

  it("only lists and never runs a setup", async () => {
    missing.mockResolvedValue([ORG_B_NOTES]);

    await setupOrganizationsCommand(["--check"], deps());

    expect(run).not.toHaveBeenCalled();
  });

  it("passes --module and --organization to the listing", async () => {
    await setupOrganizationsCommand(
      ["--check", "--module", "notes", "--organization", "org-a"],
      deps(),
    );

    expect(missing).toHaveBeenCalledTimes(1);
    expect(missing.mock.calls[0][0]).toEqual({
      module: "notes",
      organizationId: "org-a",
    });
  });

  it("without filters passes neither module nor organization", async () => {
    await setupOrganizationsCommand(["--check"], deps());

    expect(missing.mock.calls[0][0]).toStrictEqual({});
  });
});

describe("setupOrganizationsCommand run mode", () => {
  it("passes --module notes and --organization org-a to the run", async () => {
    await setupOrganizationsCommand(
      ["--module", "notes", "--organization", "org-a"],
      deps(),
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual({
      module: "notes",
      organizationId: "org-a",
    });
    expect(missing).not.toHaveBeenCalled();
  });

  it("passes only --module when no organization is given", async () => {
    await setupOrganizationsCommand(["--module", "notes"], deps());

    expect(run.mock.calls[0][0]).toStrictEqual({ module: "notes" });
  });

  it("logs each ran pair and exits 0 when nothing failed", async () => {
    run.mockResolvedValue({ ran: [ORG_A_TASKS, ORG_B_NOTES], failed: [] });

    await expect(setupOrganizationsCommand([], deps())).resolves.toBe(0);
    expect(log.mock.calls).toEqual([["ran org-a tasks"], ["ran org-b notes"]]);
  });

  it("logs ran and failed pairs and exits 1 when any failed", async () => {
    run.mockResolvedValue({ ran: [ORG_A_TASKS], failed: [ORG_B_NOTES] });

    await expect(setupOrganizationsCommand([], deps())).resolves.toBe(1);
    expect(log.mock.calls).toEqual([
      ["ran org-a tasks"],
      ["failed org-b notes"],
    ]);
  });

  it("exits 1 when everything failed", async () => {
    run.mockResolvedValue({ ran: [], failed: [ORG_B_NOTES] });

    await expect(setupOrganizationsCommand([], deps())).resolves.toBe(1);
    expect(log.mock.calls).toEqual([["failed org-b notes"]]);
  });

  it("with nothing to run prints Nothing to set up and exits 0", async () => {
    await expect(setupOrganizationsCommand([], deps())).resolves.toBe(0);
    expect(log.mock.calls).toEqual([["Nothing to set up"]]);
  });
});

describe("setupOrganizationsCommand errors", () => {
  it("an OrganizationSetupError from the run is printed as an error and exits 1", async () => {
    run.mockRejectedValue(
      new OrganizationSetupError(
        "Module notes has no organization setup or is disabled",
      ),
    );

    await expect(
      setupOrganizationsCommand(["--module", "notes"], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["Module notes has no organization setup or is disabled"],
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it("an OrganizationSetupError from the check is printed as an error and exits 1", async () => {
    missing.mockRejectedValue(
      new OrganizationSetupError("Organization org-x not found"),
    );

    await expect(
      setupOrganizationsCommand(["--check", "--organization", "org-x"], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([["Organization org-x not found"]]);
  });

  it("another error is not swallowed", async () => {
    run.mockRejectedValue(new Error("db down"));

    await expect(setupOrganizationsCommand([], deps())).rejects.toThrow(
      "db down",
    );
  });

  it("an unknown option is printed as an error, exits 1 and touches nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--modul", "notes"], deps()),
    ).resolves.toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("--modul");
    expect(run).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
  });

  it("a positional argument is rejected as an error with exit 1", async () => {
    await expect(setupOrganizationsCommand(["notes"], deps())).resolves.toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("--module without a value is an error with exit 1", async () => {
    await expect(setupOrganizationsCommand(["--module"], deps())).resolves.toBe(
      1,
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("setupOrganizationsCommand empty option values", () => {
  it("--organization with an empty value is an error with exit 1 and touches nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--organization", ""], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["--organization needs a non-empty organization id"],
    ]);
    expect(missing).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("--organization= with an empty inline value is an error with exit 1 and touches nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--organization="], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["--organization needs a non-empty organization id"],
    ]);
    expect(missing).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("--check with an empty --organization is an error with exit 1 and lists nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--check", "--organization", ""], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["--organization needs a non-empty organization id"],
    ]);
    expect(missing).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("--module with an empty value is an error with exit 1 and runs nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--module", ""], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["--module needs a non-empty module key"],
    ]);
    expect(run).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("--check with an empty --module is an error with exit 1 and lists nothing", async () => {
    await expect(
      setupOrganizationsCommand(["--check", "--module="], deps()),
    ).resolves.toBe(1);
    expect(error.mock.calls).toEqual([
      ["--module needs a non-empty module key"],
    ]);
    expect(missing).not.toHaveBeenCalled();
  });
});
