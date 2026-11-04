# Moduł `api-keys`: użycie we własnym kodzie

Po przeczytaniu będziesz wiedzieć:

- jak zadeklarować własny zakres i napisać trasę `/api/v1/…` chronioną `authenticateApiKey` z jawnym filtrem organizacji;
- jak zapisać zdarzenie dziennika z kanałem `API` dla zmiany wykonanej kluczem;
- jakie zasady bezpieczeństwa i izolacji organizacji obowiązują przy kluczach API;
- jak przetestować trasę z kluczem (brak klucza, zły zakres, klucz innej organizacji) i jakie problemy pojawiają się najczęściej;
- jakie zmienne, trasy, zakresy, akcje i komunikaty ma moduł.

Zweryfikowano z kodem: 2788536, 2026-11-04

Źródła:

- `src/features/api-keys/` (`module.ts`, `env.ts`, `services/authenticate-api-key.ts`, `services/api-scopes.ts`, `services/organization-api.ts`, `services/commands/api-key-commands.ts`, `components/api-keys-manager.tsx`, `i18n/`) z testami w `__tests__/`, w tym `__tests__/organization-route.integration.test.ts` i `services/__tests__/api-keys-isolation.integration.test.ts`
- `src/app/api/v1/organization/route.ts`
- `src/shared/lib/audit.ts`
- `src/test/integration/` (`setup-env.ts`, `database.ts`, `global-setup.ts`), `e2e/env.ts`
- `src/__tests__/server-entrypoints-guard.test.ts`
- `mutation-gate.json`

Ten plik jest drugą częścią opisu modułu `api-keys`. Co moduł robi, jak go zainstalować, skonfigurować i usunąć, co dodaje do aplikacji i jakie ma punkty wejścia, opisuje [14-modul-api-keys.md](14-modul-api-keys.md). „(sprawdzone)” i „przykład z przebiegu” znaczą to samo co tam: przebieg z 2026-10-30 na projekcie `api-demo` założonym z tagu `v0.1.0` z modułami `api-keys` i `audit-logs` i z funkcją projektu `deliveries`, zakończony zielonym `npm run verify` i `npm run test:integration` ([opis przebiegu](14-modul-api-keys.md#przebieg)).

<a id="uzycie"></a>

## Użycie z własnego kodu

Przykłady pochodzą z funkcji `deliveries` z przebiegu: zewnętrzny system czyta i przyjmuje dostawy organizacji. Funkcja ma wpis w `projectModules` (`"requires": ["api-keys"]`, wzorce `src/features/deliveries/**`, `src/app/api/v1/deliveries/**`, `prisma/schema/deliveries.prisma`, relacja `deliveries Delivery[]` w `Organization`) i model `Delivery` z `organizationId`; wpis i model opisuje tutorial [09](09-nowy-modul.md#krok-3).

Początek wpisu `deliveries` w `.wa/kit.json` (przykład z przebiegu, fragment):

```json
// …
  "projectModules": {
    "deliveries": {
      "manifest": {
        "name": "deliveries",
        "version": "0.1.0",
        "description": "Funkcja projektu: dostawy przez API",
        "requires": [
          "api-keys"
        ],
// …
```

<a id="wlasny-zakres"></a>

### Własny zakres

`src/features/deliveries/module.ts` (przykład z przebiegu)

```ts
export default defineModule({
  key: "deliveries",
  nav: [],
  routePrefixes: [],
  apiScopes: [
    { key: "deliveries:read", labelKey: "scopes.deliveriesRead" },
    { key: "deliveries:write", labelKey: "scopes.deliveriesWrite" },
  ],
  auditActions: [
    { action: "delivery.accepted", labelKey: "action-delivery-accepted" },
  ],
});
```

Etykiety leżą w `src/features/deliveries/i18n/pl.json` (`"scopes": { "deliveriesRead": "Odczyt dostaw", "deliveriesWrite": "Przyjmowanie dostaw" }`, `"action-delivery-accepted": "Przyjęcie dostawy"`) i w `en.json`. Funkcja nie ma strony, więc `nav` i `routePrefixes` są puste. Po dodaniu `module.ts` uruchom `npm run wa -- generate`. Osobne zakresy odczytu i zapisu pozwalają wystawić klucz, który tylko czyta.

<a id="wlasna-trasa"></a>

### Trasa z kluczem i serwis z filtrem organizacji

`src/app/api/v1/deliveries/route.ts` (przykład z przebiegu)

```ts
import { authenticateApiKey } from "@/features/api-keys/services/authenticate-api-key";
import {
  acceptDeliveryForApiKey,
  listDeliveriesForApiKey,
} from "@/features/deliveries/services/delivery-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "deliveries:read");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  return Response.json(await listDeliveriesForApiKey(auth.context), {
    headers: NO_STORE,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "deliveries:write");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  const body: unknown = await request.json().catch(() => null);
  const result = await acceptDeliveryForApiKey(auth.context, body);
  if (!result.success) {
    return Response.json(
      { error: result.error },
      { status: 400, headers: NO_STORE },
    );
  }
  return Response.json(result.data, { status: 201, headers: NO_STORE });
}
```

Trasa najpierw woła `authenticateApiKey`, potem przekazuje `auth.context` do serwisu i ustawia `Cache-Control: no-store` na każdej odpowiedzi, także błędach, żeby pośrednie cache nie zachowały danych organizacji. `request.json().catch(() => null)` zamienia niepoprawny JSON na błąd walidacji (400) zamiast 500. Serwis leży w `services/delivery-api.ts`, bez `"use server"` ([Gdzie położyć kod](14-modul-api-keys.md#bez-orgcontext)):

`src/features/deliveries/services/delivery-api.ts` (przykład z przebiegu)

```ts
export async function listDeliveriesForApiKey(
  context: ApiKeyContext,
): Promise<DeliveryApiItem[]> {
  return prisma.delivery.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, supplier: true, packages: true, createdAt: true },
  });
}
```

Typ importujesz z modułu: `import type { ApiKeyContext } from "@/features/api-keys/services/authenticate-api-key";`. Wejście waliduje schemat Zod z `contracts/` (`supplier` 1–200 znaków, `packages` liczba całkowita 1–10 000).

<a id="kanal-api"></a>

### Zapis zdarzenia z kanałem `API`

`src/features/deliveries/services/delivery-api.ts` (przykład z przebiegu, ciąg dalszy)

```ts
export async function acceptDeliveryForApiKey(
  context: ApiKeyContext,
  input: unknown,
): Promise<OperationResult<{ id: string }>> {
  const parsed = acceptDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "invalid_input" };
  }
  const delivery = await prisma.delivery.create({
    data: { organizationId: context.organizationId, ...parsed.data },
    select: { id: true },
  });
  await trackAudit({
    organizationId: context.organizationId,
    actorUserId: null,
    action: "delivery.accepted",
    entityType: "delivery",
    entityId: delivery.id,
    newData: parsed.data,
    channel: "API",
    credentialId: context.apiKeyId,
  });
  return { success: true, data: { id: delivery.id } };
}
```

Wpis z przebiegu: `action: "delivery.accepted"`, `user_id` puste, `channel: "API"`, `credentialId` równe id klucza, `newData: { supplier: "Hurtownia Północ", packages: 3 }` (sprawdzone testem i zapytaniem do bazy po wywołaniu przez `curl`). `credential_id` nie ma klucza obcego, więc wpis przeżywa usunięcie klucza; po usunięciu nie odczytasz już nazwy klucza z identyfikatora. Do `newData` przekazuj tylko pola, które mają być w dzienniku ([redakcja](13-modul-audit-logs.md#redakcja)). Nazwy akcji `delivery.received` nie używaj w projekcie z `audit-logs` ([13](13-modul-audit-logs.md#auditactions)). `trackAudit` działa też bez `audit-logs` i wtedy nic nie zapisuje.

<a id="wywolanie"></a>

### Wywołanie z zewnątrz

Klucz z zakresem tworzy owner albo admin na stronie `/api-keys`. Zewnętrzny system wysyła go w nagłówku:

```bash
curl -X POST https://<adres-aplikacji>/api/v1/deliveries \
  -H "Authorization: Bearer <klucz>" \
  -H "Content-Type: application/json" \
  -d '{"supplier":"Hurtownia Północ","packages":3}'
```

Odpowiedzi z przebiegu na zbudowanym serwerze (sprawdzone): bez nagłówka `401 {"error":"missing"}` z `cache-control: no-store`; `POST` kluczem z samym `deliveries:read` `403 {"error":"scope"}`; `POST` kluczem z `deliveries:write` `201 {"id":"…"}`; niepoprawny JSON `400 {"error":"invalid_input"}`; `GET` kluczem z `deliveries:read` `200` z listą dostaw; ten sam klucz na `GET /api/v1/organization` `403 {"error":"scope"}`, bo nie ma `organization:read`. Po udanych wywołaniach klucze miały ustawione `lastUsedAt`.

<a id="bez-modulu"></a>

### Kod, który ma działać bez modułu

Deklaracja `apiScopes` buduje się i nie przeszkadza w projekcie bez `api-keys`; zacznie działać po `wa add api-keys`. Trasa z kluczem już nie: importuje `authenticateApiKey`, więc bez modułu projekt się nie zbuduje. Funkcja przenoszona między projektami trzyma trasy z kluczem w osobnej funkcji projektu z `api-keys` w `requires` albo ma moduł w każdym projekcie. Serwis, który przyjmuje tylko `{ organizationId }` zamiast `ApiKeyContext`, nie importuje niczego z modułu i działa wszędzie.

<a id="bezpieczenstwo"></a>

## Bezpieczeństwo i izolacja organizacji

- **Jawny filtr organizacji w trasie.** `authenticateApiKey` daje organizację z wiersza klucza, ale nie filtruje zapytań; każde zapytanie wołane z trasy ma `organizationId: context.organizationId` ([Brak `OrgContext`](14-modul-api-keys.md#bez-orgcontext)).
- **Trasa bez `authenticateApiKey` jest publiczna**; nikt tego nie sprawdza automatycznie ([kontrakt](14-modul-api-keys.md#authenticate)).
- **Serwis trasy bez `"use server"`**, inaczej staje się akcją serwerową z kontekstem podanym przez klienta ([Gdzie położyć kod](14-modul-api-keys.md#bez-orgcontext)).
- **Pepper wymagany w produkcji, jego zmiana unieważnia wszystkie klucze**, a błędna wartość daje 500 w całej aplikacji ([Konfiguracja peppera](14-modul-api-keys.md#pepper)).
- **Sekret pokazany raz**; baza ma tylko `displayPrefix` i HMAC klucza, a lista i dziennik tylko `displayPrefix` ([Jednorazowe pokazanie](14-modul-api-keys.md#sekret)).
- **`Cache-Control: no-store`** na każdej odpowiedzi trasy z kluczem, także błędzie ([Trasa](#wlasna-trasa)).
- **Zakres musi być zadeklarowany**; po usunięciu deklaracji klucze tracą dostęp bez zmiany wiersza ([`apiScopes`](14-modul-api-keys.md#apiscopes)).
- **Usunięcie konta autora nie wyłącza klucza.** Klucz należy do organizacji; przy odejściu osoby, która znała klucz, unieważnij go ręcznie ([Model](14-modul-api-keys.md#model)).
- **Brak rate limitingu i logu żądań**; nadużycie widać tylko po `lastUsedAt` ([Co robi moduł](14-modul-api-keys.md#co-robi)).
- **Izolacja komend.** Unieważnienie i usunięcie klucza innej organizacji zwraca „Nie znaleziono klucza” i nie zmienia wiersza; zapis ma warunek `{ id, organizationId }`, więc także zmiana organizacji wiersza między odczytem a zapisem nie trafi w cudzy klucz (testy w `api-keys-isolation.integration.test.ts`).
- **Tryb serwisowy** obowiązuje komendy zarządzania kluczami, nie trasy z kluczem ([Dostęp](14-modul-api-keys.md#dostep)).
- Katalog `src/features/api-keys/services/` jest na liście `critical` bramki mutacji (`mutation-gate.json`, [D26](decyzje.md#d26)).

<a id="testowanie"></a>

## Testowanie własnego kodu z modułem

**Test integracyjny trasy.** Trasę sprawdza test na prawdziwej bazie, który woła funkcję `GET` albo `POST` z pliku `route.ts` z obiektem `Request`, bez serwera HTTP i bez mocków: `authenticateApiKey`, Prisma i `trackAudit` działają naprawdę. Klucz test zapisuje sam: `hashedKey` to HMAC liczony w teście z `process.env.API_KEY_PEPPER` (wartość z `src/test/integration/setup-env.ts`), a nie przez `hashApiKey`, więc zmiana sposobu haszowania w kodzie wyjdzie w teście. Tak robi też test kitu `organization-route.integration.test.ts`.

`src/features/deliveries/services/__tests__/deliveries-route.integration.test.ts` (przykład z przebiegu)

```ts
function hash(plaintext: string): string {
  return createHmac("sha256", process.env.API_KEY_PEPPER ?? "")
    .update(plaintext)
    .digest("hex");
}

async function seedKey(
  organizationId: string,
  plaintext: string,
  scopes: string[],
): Promise<{ id: string }> {
  return prisma.apiKey.create({
    data: {
      organizationId,
      name: `klucz ${plaintext.slice(-4)}`,
      displayPrefix: plaintext.slice(0, 20),
      hashedKey: hash(plaintext),
      scopes,
    },
    select: { id: true },
  });
}
// …
describe("GET /api/v1/deliveries", () => {
  it("bez klucza zwraca 401 missing z no-store", async () => {
    const response = await GET(request("GET", null));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "missing" });
  });

  it("klucz bez deliveries:read zwraca 403 scope", async () => {
    await seedKey(world.orgA.id, KEY_A, ["organization:read"]);

    const response = await GET(request("GET", `Bearer ${KEY_A}`));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "scope" });
  });
  // …
  it("klucz organizacji B nie widzi dostaw A", async () => {
    await seedKey(world.orgB.id, KEY_B, ["deliveries:read"]);

    const response = await GET(request("GET", `Bearer ${KEY_B}`));

    const items = (await response.json()) as { supplier: string }[];
    expect(items.map((item) => item.supplier)).toEqual(["Hurtownia B"]);
  });
```

`beforeEach` woła `resetDatabase()`, tworzy organizacje A i B (`createOrganization` z `members: []`) i po jednej dostawie w każdej. Plik ma jeszcze cztery przypadki: klucz A widzi tylko dostawy A; `POST` kluczem z samym `deliveries:read` daje 403 i nic nie zapisuje; błędne wejście daje 400 `invalid_input` bez zapisu; `POST` z `organizationId` organizacji B w treści zapisuje dostawę w organizacji klucza i wpis dziennika z `channel: "API"`, `userId: null` i `credentialId` klucza. Wynik: `Tests  7 passed (7)`. Kontrola siły testu (sprawdzone): po usunięciu filtra `organizationId` z serwisu odczytu padają dwa przypadki, po zmianie kanału na `WEB` jeden, po usunięciu deklaracji `deliveries:read` z `module.ts` dwa.

- Wartości oczekiwane to literały (`{ error: "scope" }`, `["Hurtownia B"]`), nie wynik kodu produkcyjnego ([08b](08b-testy-adwersarialne.md)).
- Test izolacji ma dwie organizacje i sprawdza, że klucz jednej nie widzi i nie zmienia danych drugiej ([08](08-testy.md#izolacja)).
- Projekt potrzebuje własnej bazy z nazwą kończącą się na `_test`: `globalSetup` uruchamia `prisma db push` ze schematem projektu, które usuwa puste tabele spoza schematu, a odmawia, gdy dopasowanie skasowałoby dane (na przykład niepustą tabelę modułu, którego projekt nie ma) ([08](08-testy.md#baza-integracja)).
- Test kodu, który woła komendy kluczy z sesją (a nie trasy), mockuje sesję przez `vi.spyOn(auth.api, "getSession")`, I/O frameworka i `trackAudit` (żeby sprawdzić treść zdarzenia bez ujścia), jak `api-keys-isolation.integration.test.ts` ([08](08-testy.md#integracyjne)).
- Test nie potrzebuje `API_KEY_PEPPER` w `.env`: integracyjne testy biorą wartość z `setup-env.ts`, jednostkowe mockują `@/shared/lib/env`.

<a id="problemy"></a>

## Typowe problemy

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| Serwer nie startuje: wypisuje raport `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):` z linią `- API_KEY_PEPPER: …` i kończy się kodem 1 (sprawdzone 2026-11-04 na zbudowanym serwerze repozytorium kitu). | Brak peppera, mniej niż 32 znaki albo wartość z `.env.example` przy `NODE_ENV=production` (sprawdzone). | Ustaw własny pepper i wdroż ponownie ([Konfiguracja peppera](14-modul-api-keys.md#pepper)). |
| Wszystkie klucze dostają 401 `invalid`, choć na liście są „Aktywne” | Zmienił się `API_KEY_PEPPER` (sprawdzone) albo środowisko ma inny pepper niż to, na którym klucze utworzono. | Przywróć poprzednią wartość albo wystaw nowe klucze i usuń stare. |
| 401 `missing` mimo podanego klucza | Nagłówek nie zaczyna się dokładnie od `Bearer ` (na przykład `bearer`, tabulator, sam klucz). | `Authorization: Bearer <klucz>`. |
| 401 `invalid` dla właśnie skopiowanego klucza | Klucz skopiowany niecały, w cudzysłowie albo z dwiema spacjami po `Bearer` lub spacją wewnątrz; klucz usunięty. Spacje na końcu nagłówka nie szkodzą, bo usuwa je `Headers`. | Skopiuj klucz ponownie; zgubionego nie odzyskasz, wystaw nowy. |
| 403 `scope` dla klucza z zaznaczonym zakresem | Trasa wymaga innego zakresu albo żaden moduł w rejestrze nie deklaruje wymaganego zakresu (sprawdzone). | Sprawdź `apiScopes` w `module.ts` i `npm run wa -- generate` po dodaniu nowego `module.ts`. |
| Zakresu funkcji nie ma w formularzu na `/api-keys` | Brak deklaracji `apiScopes` albo `module.ts` poza rejestrem. | Dodaj deklarację; dla nowego pliku uruchom generator. |
| Zamiast etykiety zakresu ścieżka klucza i `MISSING_MESSAGE` | Brak klucza etykiety w `i18n/<język>.json` albo `key` modułu różny od nazwy katalogu. | Dodaj klucz w obu językach; ustaw `key` równy nazwie katalogu. |
| „Osiągnięto limit 10 aktywnych kluczy” | Organizacja ma 10 kluczy bez unieważnienia i nie wygasłych. | Unieważnij albo usuń nieużywany klucz ([Limit](14-modul-api-keys.md#limit)). |
| „Nie udało się utworzyć klucza” | Błędne wejście (nazwa, zakres, okres) albo awaria bazy; szczegóły tylko w logu. | Sprawdź log serwera. |
| `TS2307: Cannot find module '@/features/api-keys/…'` | Trasa importuje plik modułu w projekcie bez modułu albo po `wa remove`. | `npm run wa -- add api-keys` albo usuń trasę. |
| `wa remove api-keys` kończy się `Moduł api-keys jest wymagany przez: <moduł>` | Moduł projektu ma `api-keys` w `requires` (sprawdzone). | Usuń z niego trasy z kluczem i wpis w `requires` albo zostaw moduł. |
| Trasa zwraca dane innej organizacji | Zapytanie w serwisie bez `organizationId: context.organizationId`. | Dodaj filtr i test izolacji ([Testowanie](#testowanie)). |

<a id="referencja"></a>

## Referencja

Pola deklaracji modułu w `module.ts`: [Definicja modułu](14-modul-api-keys.md#definicja-modulu); pole `apiScopes` dla własnego kodu: [Deklaracja `apiScopes`](14-modul-api-keys.md#apiscopes).

<a id="referencja-env"></a>

### Zmienne środowiskowe

| Zmienna | Wymagana | Reguła | Wartość w kicie |
| --- | --- | --- | --- |
| `API_KEY_PEPPER` | tak, gdy moduł jest w projekcie | co najmniej 32 znaki; przy `NODE_ENV=production` różna od `dev-only-api-key-pepper-change-me-0123456789` | `.env.example` i `.env` z `wa create`: wartość przykładowa; testy integracyjne: `src/test/integration/setup-env.ts`; e2e: `e2e/env.ts` |

<a id="referencja-trasy"></a>

### Trasy API

| Trasa | Zakres | Odpowiedzi |
| --- | --- | --- |
| `GET /api/v1/organization` | `organization:read` | 200 `{ id, name, slug }`; 401 `{ error: "missing" \| "invalid" \| "revoked" \| "expired" }`; 403 `{ error: "scope" }`; zawsze `Cache-Control: no-store`. |

<a id="referencja-zakresy"></a>

### Zakresy i akcje dziennika

| Napis | Rodzaj | Etykieta `pl` |
| --- | --- | --- |
| `organization:read` | zakres | Odczyt danych organizacji |
| `api_key.created` | akcja | Utworzono klucz API |
| `api_key.revoked` | akcja | Unieważniono klucz API |
| `api_key.deleted` | akcja | Usunięto klucz API |

<a id="referencja-komunikaty"></a>

### Komunikaty

| Komunikat | Gdzie | Znaczenie |
| --- | --- | --- |
| `Osiągnięto limit 10 aktywnych kluczy` | `/api-keys`, toast | Limit aktywnych kluczy ([Limit](14-modul-api-keys.md#limit)). |
| `Nie znaleziono klucza` | `/api-keys`, toast | Klucz nie istnieje w aktywnej organizacji. |
| `Potwierdź zmianę w trybie serwisowym` | wynik komendy | Superadmin bez potwierdzenia ([Dostęp](14-modul-api-keys.md#dostep)). |
| `Nie udało się utworzyć klucza`, `Nie udało się unieważnić klucza`, `Nie udało się usunąć klucza` | `/api-keys`, toast; log `error` | Błąd walidacji albo bazy. |
| `Nie udało się skopiować klucza` | `/api-keys`, toast przy dialogu klucza | Przeglądarka odmówiła zapisu do schowka; skopiuj klucz ręcznie z okna. |
| `Nie udało się zaktualizować lastUsedAt klucza API` (log `warn`, pola `apiKeyId`, `error`) | log serwera | Zapis `lastUsedAt` się nie powiódł; uwierzytelnienie przeszło. |
| `- API_KEY_PEPPER: w produkcji nie może być wartością z .env.example` | raport `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):` na stderr serwera przy starcie, proces kończy się kodem 1; w `npm run admin:create` ten sam komunikat w błędzie `Nieprawidłowe zmienne środowiskowe: …` (z kodu) | Wartość przykładowa w produkcji. |
| `- API_KEY_PEPPER: Too small: expected string to have >=32 characters` | jak wyżej | Pepper krótszy niż 32 znaki (sprawdzone przez `parseEnv` i 2026-11-04 na zbudowanym serwerze repozytorium kitu). |
| `Moduł api-keys jest wymagany przez: <lista>` | `wa remove` | Moduł projektu wymaga `api-keys`. |
