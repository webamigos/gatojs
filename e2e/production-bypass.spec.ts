import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./env";
import { signInThroughApi } from "./helpers";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const API_KEY_LABELS = {
  create: "Nowy klucz",
  name: "Nazwa",
  organizationReadScope: "Odczyt danych organizacji",
  submit: "Utwórz klucz",
  secretTitle: "Twój nowy klucz API",
} as const;

test.describe.configure({ mode: "serial" });

test.describe("withoutTenantScope in the production build", () => {
  test("admin uploads an editor image and downloads it", async ({
    page,
    baseURL,
  }) => {
    await signInThroughApi(page, baseURL!, E2E_ADMIN.email, E2E_ADMIN.password);

    const upload = await page.request.post("/api/uploads", {
      headers: { origin: baseURL! },
      multipart: {
        purpose: "editor-image",
        file: {
          name: "pixel.png",
          mimeType: "image/png",
          buffer: ONE_PIXEL_PNG,
        },
      },
    });
    expect(upload.status()).toBe(201);
    const created = (await upload.json()) as { id: string; url: string };
    expect(created.url).toBe(`/api/uploads/${created.id}`);

    const download = await page.request.get(`/api/uploads/${created.id}`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toMatch(/^image\//);
    expect((await download.body()).length).toBeGreaterThan(0);
  });

  test("an API key created in the UI authenticates GET /api/v1/organization", async ({
    page,
    request,
    baseURL,
  }) => {
    await signInThroughApi(page, baseURL!, E2E_ADMIN.email, E2E_ADMIN.password);

    await page.goto("/api-keys");
    await page.getByRole("button", { name: API_KEY_LABELS.create }).click();
    const form = page.getByRole("dialog", { name: API_KEY_LABELS.create });
    await form.getByLabel(API_KEY_LABELS.name).fill("e2e production bypass");
    await form
      .getByRole("checkbox", { name: API_KEY_LABELS.organizationReadScope })
      .click();
    await form.getByRole("button", { name: API_KEY_LABELS.submit }).click();

    const secretDialog = page.getByRole("dialog", {
      name: API_KEY_LABELS.secretTitle,
    });
    await expect(secretDialog).toBeVisible();
    const secret = (
      await secretDialog.locator(".font-mono").innerText()
    ).trim();
    expect(secret.length).toBeGreaterThan(20);

    const authorized = await request.get("/api/v1/organization", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(authorized.status()).toBe(200);
    expect(await authorized.json()).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
    });

    const rejected = await request.get("/api/v1/organization", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(rejected.status()).toBe(401);
  });
});
