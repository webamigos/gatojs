// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getTranslator } from "../server-translator";

describe("getTranslator", () => {
  it('en, "errors" → noPermission po angielsku', async () => {
    const t = await getTranslator("en", "errors");

    expect(t("noPermission")).toBe("You don't have permission to do this");
  });

  it('pl, "errors" → noPermission po polsku', async () => {
    const t = await getTranslator("pl", "errors");

    expect(t("noPermission")).toBe("Brak uprawnień");
  });

  it("przestrzeń nazw modułu api-keys w en", async () => {
    const t = await getTranslator("en", "api-keys");

    expect(t("errors.keyNotFound")).toBe("Key not found");
  });

  it("przestrzeń nazw modułu api-keys w pl", async () => {
    const t = await getTranslator("pl", "api-keys");

    expect(t("errors.keyNotFound")).toBe("Nie znaleziono klucza");
  });

  it("przestrzeń nazw modułu uploads w en", async () => {
    const t = await getTranslator("en", "uploads");

    expect(t("errors.noDeletePermission")).toBe(
      "You don't have permission to delete this file",
    );
  });

  it("wstawia wartości: domyślna nazwa organizacji w en", async () => {
    const t = await getTranslator("en", "common");

    expect(t("defaultOrganizationName", { name: "Ann" })).toBe(
      "Ann's organization",
    );
  });

  it("wstawia wartości: domyślna nazwa organizacji w pl", async () => {
    const t = await getTranslator("pl", "common");

    expect(t("defaultOrganizationName", { name: "Ann" })).toBe(
      "Ann — organizacja",
    );
  });

  it("wstawia wartości: temat zaproszenia w en", async () => {
    const t = await getTranslator("en", "emails");

    expect(t("invitation.subject", { organizationName: "Acme" })).toBe(
      "Invitation to Acme",
    );
  });
});

describe("komunikaty ze specyfikacji w obu językach", () => {
  it.each([
    [
      "errors",
      "serviceModeConfirmationRequired",
      "Potwierdź zmianę w trybie serwisowym",
      "Confirm the change in service mode",
    ],
    [
      "errors",
      "noPermission",
      "Brak uprawnień",
      "You don't have permission to do this",
    ],
    ["errors", "invalidData", "Nieprawidłowe dane", "Invalid data"],
    [
      "errors",
      "sessionExpired",
      "Sesja wygasła. Zaloguj się ponownie.",
      "Your session has expired. Sign in again.",
    ],
    [
      "errors",
      "changePasswordFailed",
      "Nie udało się zmienić hasła. Sprawdź aktualne hasło.",
      "Couldn't change the password. Check your current password.",
    ],
    [
      "errors",
      "userExists",
      "Użytkownik z tym adresem już istnieje",
      "A user with this email already exists",
    ],
    [
      "errors",
      "inviteFailed",
      "Nie udało się zaprosić użytkownika",
      "Couldn't invite the user",
    ],
    [
      "errors",
      "impersonationLogFailed",
      "Nie udało się zapisać zdarzenia impersonacji",
      "Couldn't record the impersonation event",
    ],
    [
      "errors",
      "noOrganizationAccess",
      "Brak dostępu do organizacji",
      "You don't have access to this organization",
    ],
    [
      "errors",
      "signupDisabled",
      "Rejestracja jest wyłączona",
      "Sign-up is disabled",
    ],
    [
      "errors",
      "invitationInvalid",
      "Zaproszenie jest nieprawidłowe lub wygasło",
      "The invitation is invalid or has expired",
    ],
    [
      "errors",
      "superadminRoleOnlyBySuperadmin",
      "Rolę superadmin może nadać tylko superadmin",
      "Only a superadmin can grant the superadmin role",
    ],
    [
      "errors",
      "impersonationForbidden",
      "Brak uprawnień do podszycia się pod tego użytkownika",
      "You can't sign in as this user",
    ],
    [
      "errors",
      "serviceAccountOnlyBySuperadmin",
      "Konto serwisowe może zmieniać tylko superadmin",
      "Only a superadmin can change a service account",
    ],
    [
      "errors",
      "accountForbidden",
      "Brak uprawnień do tego konta",
      "You don't have permission to change this account",
    ],
    [
      "errors",
      "orgManagementRequiresAdmin",
      "Zarządzanie organizacją wymaga roli administratora",
      "Managing the organization requires the admin role",
    ],
    ["common", "dataTable.rowsPerPage", "Wierszy na stronę", "Rows per page"],
    ["common", "dataTable.previous", "Poprzednia", "Previous"],
    ["common", "dataTable.next", "Następna", "Next"],
    ["common", "dataTable.noResults", "Brak wyników.", "No results."],
    [
      "emails",
      "passwordReset.subject",
      "Zresetuj hasło",
      "Reset your password",
    ],
    [
      "emails",
      "passwordReset.intro",
      "Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta.",
      "We received a request to reset the password for your account.",
    ],
    [
      "emails",
      "passwordReset.instruction",
      "Kliknij poniższy przycisk, aby ustawić nowe hasło:",
      "Click the button below to set a new password:",
    ],
    ["emails", "passwordReset.cta", "Zresetuj hasło", "Reset password"],
    [
      "emails",
      "passwordReset.footer",
      "Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość. Link wygaśnie za 48 godzin.",
      "If you didn't ask to reset your password, ignore this email. The link expires in 48 hours.",
    ],
    ["emails", "welcome.greetingNoName", "Cześć,", "Hi,"],
    ["emails", "welcome.cta", "Ustaw hasło", "Set password"],
    [
      "emails",
      "welcome.footer",
      "Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją. Link jest ważny przez 48 godzin.",
      "If you weren't expecting this email, ignore it. The link is valid for 48 hours.",
    ],
    ["emails", "invitation.greeting", "Cześć,", "Hi,"],
    ["emails", "invitation.cta", "Przyjmij zaproszenie", "Accept invitation"],
    [
      "emails",
      "invitation.footer",
      "Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.",
      "If you weren't expecting this email, ignore it.",
    ],
    [
      "api-keys",
      "errors.keyNotFound",
      "Nie znaleziono klucza",
      "Key not found",
    ],
    [
      "api-keys",
      "errors.keyLimitReached",
      "Osiągnięto limit 10 aktywnych kluczy",
      "You've reached the limit of 10 active keys",
    ],
    [
      "api-keys",
      "errors.createFailed",
      "Nie udało się utworzyć klucza",
      "Couldn't create the key",
    ],
    [
      "api-keys",
      "errors.revokeFailed",
      "Nie udało się unieważnić klucza",
      "Couldn't revoke the key",
    ],
    [
      "api-keys",
      "errors.deleteFailed",
      "Nie udało się usunąć klucza",
      "Couldn't delete the key",
    ],
    [
      "uploads",
      "errors.deleteFailed",
      "Nie udało się usunąć pliku",
      "Couldn't delete the file",
    ],
    [
      "uploads",
      "errors.noDeletePermission",
      "Brak uprawnień do usunięcia pliku",
      "You don't have permission to delete this file",
    ],
  ])("%s.%s: pl %j, en %j", async (namespace, key, pl, en) => {
    const tPl = await getTranslator("pl", namespace);
    const tEn = await getTranslator("en", namespace);

    expect(tPl(key)).toBe(pl);
    expect(tEn(key)).toBe(en);
  });

  it.each([
    [
      "welcome.subject",
      { appName: "WA App" },
      "Witamy w WA App",
      "Welcome to WA App",
    ],
    ["welcome.greeting", { name: "Ann" }, "Cześć Ann,", "Hi Ann,"],
    [
      "welcome.body",
      { appName: "WA App" },
      "Utworzono dla Ciebie konto w WA App. Aby dokończyć zakładanie konta, ustaw swoje hasło:",
      "An account was created for you in WA App. To finish setting it up, set your password:",
    ],
    [
      "invitation.subject",
      { organizationName: "Acme" },
      "Zaproszenie do Acme",
      "Invitation to Acme",
    ],
    [
      "invitation.bodyWithInviter",
      { inviterName: "Bob", organizationName: "Acme" },
      "Bob zaprasza Cię do organizacji Acme.",
      "Bob invited you to join Acme.",
    ],
    [
      "invitation.body",
      { organizationName: "Acme" },
      "Zaproszono Cię do organizacji Acme.",
      "You've been invited to join Acme.",
    ],
  ])("emails.%s z wartościami %j", async (key, values, pl, en) => {
    const tPl = await getTranslator("pl", "emails");
    const tEn = await getTranslator("en", "emails");

    expect(tPl(key, values)).toBe(pl);
    expect(tEn(key, values)).toBe(en);
  });
});
