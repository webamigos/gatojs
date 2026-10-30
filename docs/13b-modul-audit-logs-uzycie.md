# Moduł `audit-logs`: użycie we własnym kodzie

Po przeczytaniu będziesz wiedzieć:

- jak zapisać zdarzenie z własnej komendy przez `trackAudit` i `auditActor`, nadać mu etykietę i pokazać historię encji przez `<AuditTrail>`;
- jak napisać funkcję projektu, która działa także w projekcie bez modułu;
- jakie zasady bezpieczeństwa i izolacji organizacji obowiązują przy dzienniku zdarzeń;
- jak testować własny kod, który woła `trackAudit`, i jakie problemy pojawiają się najczęściej;
- jakie pola ma zdarzenie, jakie akcje deklaruje kit i jakie parametry przyjmuje strona `/audit-log`.

Zweryfikowano z kodem: 042a1cb, 2026-10-30

Źródła:

- `src/shared/lib/audit.ts`, `src/shared/lib/__tests__/audit.test.ts`
- `src/features/audit-logs/` (`module.ts`, `components/audit-trail.tsx`, `components/audit-log-view.tsx`, `contracts/audit-log.schemas.ts`, `services/`) z testami w `__tests__/`
- `src/features/api-keys/services/__tests__/api-keys-isolation.integration.test.ts`
- `src/features/api-keys/module.ts`, `src/features/uploads/module.ts`
- `src/test/integration/` (`database.ts`, `global-setup.ts`, `database-url.ts`)
- `mutation-gate.json`

Ten plik jest drugą częścią opisu modułu `audit-logs`. Co moduł robi, jak go zainstalować i usunąć, co dodaje do aplikacji i jakie ma punkty wejścia, opisuje [13-modul-audit-logs.md](13-modul-audit-logs.md). „(sprawdzone)” i „przykład z przebiegu” znaczą to samo co tam: przebieg z 2026-10-30 na projekcie `audit-demo` założonym z tagu `v0.1.0` z modułem `audit-logs` i funkcją projektu `deliveries`, zakończony zielonym `npm run verify` i `npm run test:integration` ([opis przebiegu](13-modul-audit-logs.md#przebieg)).

<a id="uzycie"></a>

## Użycie z własnego kodu

Przykłady pochodzą z funkcji `deliveries` z przebiegu: przyjęcie dostawy w organizacji. Funkcja ma wpis w `projectModules` z `"requires": ["audit-logs"]`, bo jej strona importuje `<AuditTrail>`; wpis i resztę plików funkcji opisuje tutorial [09](09-nowy-modul.md#krok-3).

<a id="komenda"></a>

### Zapis zdarzenia w komendzie

Komenda według kontraktu trybu serwisowego ([09b](09b-implementacja-i-bramki.md#komenda)) z `trackAudit` po udanym zapisie:

`src/features/deliveries/services/commands/receive-delivery-command.ts` (przykład z przebiegu)

```ts
    const context = await requireModuleAccess("deliveries");
    assertServiceModeConfirmed(context, confirmation);

    const delivery = await prisma.delivery.create({
      data: {
        organizationId: context.organizationId,
        supplier: parsed.data.supplier,
        packages: parsed.data.packages,
      },
      select: { id: true },
    });

    await trackAudit({
      ...auditActor(context),
      action: "delivery.accepted",
      entityType: "delivery",
      entityId: delivery.id,
      newData: {
        supplier: parsed.data.supplier,
        packages: parsed.data.packages,
      },
    });

    revalidatePath("/deliveries");
    return { success: true, data: { deliveryId: delivery.id } };
```

Import to `import { auditActor, trackAudit } from "@/shared/lib/audit";`. Kolejność ma znaczenie:

- `trackAudit` stoi **po** `assertServiceModeConfirmed` i po zapisie, więc odmowa w trybie serwisowym i błędne wejście nie zostawiają wpisu (sprawdzone testem z przebiegu). Nieudany zapis też nie zostawia wpisu, bo wyjątek z `prisma.delivery.create` przechodzi do `catch` komendy, zanim dojdzie do `trackAudit` (wynika z kodu, bez osobnego testu);
- `newData` zawiera tylko pola, które mają trafić do dziennika ([Czego redakcja nie wykryje](13-modul-audit-logs.md#redakcja));
- awaria zapisu wpisu nie zmieni wyniku komendy.

Wpis z przebiegu dla członka organizacji: `userId` członka, `action: "delivery.accepted"`, `entityType: "delivery"`, `entityId` dostawy, `newData: { supplier: "Hurtownia Północ", packages: 3 }`, `oldData: null`, `channel: "WEB"`, `serviceMode: false`; dla superadmina z potwierdzeniem trybu serwisowego `serviceMode: true` (sprawdzone).

<a id="etykieta"></a>

### Etykieta akcji

`src/features/deliveries/module.ts` (przykład z przebiegu)

```ts
export default defineModule({
  key: "deliveries",
  nav: [{ href: "/deliveries", labelKey: "nav", icon: "truck", order: 50 }],
  routePrefixes: ["/deliveries"],
  auditActions: [
    { action: "delivery.accepted", labelKey: "action-delivery-accepted" },
  ],
});
```

Klucz `action-delivery-accepted` leży w `src/features/deliveries/i18n/pl.json` (`"Przyjęcie dostawy"`) i `en.json` (`"Delivery accepted"`). Nowy plik `module.ts` albo `i18n/<język>.json` wymaga `npm run wa -- generate` ([02b](02b-rejestr-i-generator.md#uruchomienie)); nowa pozycja w istniejącym `auditActions` nie wymaga.

<a id="audit-trail"></a>

### Historia encji na stronie

`<AuditTrail entityType entityId />` to asynchroniczny komponent serwerowy: osadzasz go na stronie albo w innym komponencie serwerowym, nie w komponencie z `"use client"`.

`src/app/[locale]/(app)/deliveries/page.tsx` (przykład z przebiegu)

```tsx
import { AuditTrail } from "@/features/audit-logs/components/audit-trail";
// …
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="rounded border p-4">
              <p className="font-medium">
                {delivery.supplier} ({delivery.packages})
              </p>
              <h2 className="mt-2 text-sm font-medium">{t("history")}</h2>
              <AuditTrail entityType="delivery" entityId={delivery.id} />
            </li>
          ))}
```

Zachowanie (`audit-trail.tsx`, `audit-trail-query.ts`):

- pokazuje 50 najnowszych wpisów encji z aktywnej organizacji, od najnowszego: czas, etykietę akcji i autora („System”, gdy wpis nie ma autora); bez wpisów tekst „Brak historii”;
- użytkownik bez dostępu do modułu (rola `member`) nie widzi niczego: komponent zwraca `null`, a strona działa dalej bez 404, więc możesz go osadzić na stronie dostępnej dla wszystkich ról;
- wpis z tym samym `entityId` w innej organizacji albo z innym `entityType` się nie pokazuje;
- czas jest formatowany na serwerze (`yyyy-MM-dd HH:mm`) w strefie czasowej procesu serwera, inaczej niż kolumna daty na stronie `/audit-log`;
- każdy komponent to osobne zapytanie do bazy i osobne `getOrgContext()`; lista z wieloma encjami wykona tyle zapytań, ile jest encji.

**Bez modułu import się nie zbuduje** (`TS2307: Cannot find module '@/features/audit-logs/components/audit-trail'`, [12](12-moduly-kitu.md#punkty-wejscia)). Funkcja, która osadza komponent, ma więc `audit-logs` w `requires`: wtedy `wa remove audit-logs` odmówi ([Usunięcie](13-modul-audit-logs.md#usuniecie)).

<a id="kanal-api"></a>

### Zapis z trasy z kluczem API

Trasa uwierzytelniona kluczem nie ma sesji, więc nie ma `auditActor`. Zdarzenie składasz z kontekstu klucza: `organizationId` z kontekstu, `actorUserId: null`, `channel: "API"` i `credentialId` równe identyfikatorowi klucza. Strona `/audit-log` pokaże wtedy znaczek „API” i autora „System”. Pełny przykład trasy: [14b](14b-modul-api-keys-uzycie.md#wlasna-trasa) i [14](14-modul-api-keys.md).

<a id="bez-modulu"></a>

### Kod, który ma działać bez modułu

Funkcja projektu, która ma działać w projektach z modułem i bez niego (na przykład funkcja przenoszona między projektami albo kandydat do kitu):

- woła `trackAudit` i `auditActor` z `@/shared/lib/audit` i deklaruje `auditActions`: to działa w każdym projekcie, a zdarzenia zaczną się zapisywać po `wa add audit-logs`, bez zmiany kodu;
- nie importuje niczego z `@/features/audit-logs/` (`<AuditTrail>`, `redactSensitive`, query), bo taki import nie zbuduje się bez modułu;
- nie ma `audit-logs` w `requires`.

Rdzeń postępuje tak samo: `joinOrganizationCommand` i `enterOrganizationCommand` wołają `trackAudit` bez sprawdzania, czy moduł jest w projekcie.

<a id="bezpieczenstwo"></a>

## Bezpieczeństwo i izolacja organizacji

- **Izolacja.** Każde zapytanie modułu filtruje po `organizationId` z kontekstu: lista wpisów, lista autorów i historia encji. Filtr `userId` z identyfikatorem osoby z innej organizacji nie zwraca jej wpisów, bo warunek organizacji obowiązuje zawsze ([Dostęp według ról](13-modul-audit-logs.md#dostep), testy izolacji w `audit-log-queries.integration.test.ts` i `audit-trail-query.integration.test.ts`). Zdarzenie zapisuje się w organizacji z `event.organizationId`, więc bierz ją z kontekstu, nie z wejścia ([Kontrakt `trackAudit`](13-modul-audit-logs.md#trackaudit)).
- **Dostęp tylko dla owner i admin** (oraz ról globalnych), sprawdzany w stronie, w każdym query i w `<AuditTrail>`; `member` nie czyta query nawet przez inną stronę, bo guard jest w samym query ([Dostęp](13-modul-audit-logs.md#dostep)).
- **Wpisu nie da się dopisać ani zmienić z przeglądarki**: moduł nie ma akcji serwerowych, a `audit.ts` nie ma `"use server"` ([Kontrakt `trackAudit`](13-modul-audit-logs.md#trackaudit)).
- **Redakcja działa po nazwie klucza** i nie złapie sekretu pod neutralną nazwą ani danych osobowych ([Redakcja](13-modul-audit-logs.md#redakcja)).
- **Własne ujście dostaje dane przed redakcją** ([Ujście](13-modul-audit-logs.md#ujscie)).
- **Awaria zapisu nie przerywa komendy**: dziennik może nie mieć wpisu dla udanej zmiany ([Kontrakt `trackAudit`](13-modul-audit-logs.md#trackaudit)). Monitoruj w logach wpisy `trackAudit failed`.
- **Tryb serwisowy** jest widoczny tylko wtedy, gdy zdarzenie ma `serviceMode` z `auditActor(context)` ([Kontrakt `auditActor`](13-modul-audit-logs.md#auditactor)).
- **Brak retencji**: dane osobowe w `oldData` i `newData` zostają w bazie bezterminowo, dopóki nie usuniesz organizacji ([Co robi moduł](13-modul-audit-logs.md#co-robi)).
- Katalog `src/features/audit-logs/services/` i `src/shared/lib/audit.ts` są na liście `critical` bramki mutacji (`mutation-gate.json`, [D26](decyzje.md#d26)).

<a id="testowanie"></a>

## Testowanie własnego kodu z modułem

**Test integracyjny zapisu zdarzenia.** Komendę, która woła `trackAudit`, najlepiej sprawdza test integracyjny na prawdziwej bazie z prawdziwym `trackAudit` i ujściem `audit-logs`: sprawdza wiersz w `audit_logs`, a nie wywołanie mocka. Mockowane jest tylko I/O frameworka (`next/headers`, `next/cache`, `next/navigation`, `@/i18n/routing`, `next-intl/server`) i sesja przez `vi.spyOn(auth.api, "getSession")`, jak w testach izolacji modułów kitu ([08](08-testy.md#integracyjne)).

`src/features/deliveries/services/__tests__/receive-delivery-command.integration.test.ts` (przykład z przebiegu)

```ts
  it("zapisuje dostawę i wpis delivery.accepted w organizacji aktywnej, nie w B", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await receiveDeliveryCommand({
      supplier: "Hurtownia Północ",
      packages: "3",
    });

    expect(result.success).toBe(true);
    const deliveryId = result.data?.deliveryId ?? "";
    const rowsA = await prisma.auditLog.findMany({
      where: { organizationId: world.orgA.id },
    });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({
      userId: world.alice.id,
      action: "delivery.accepted",
      entityType: "delivery",
      entityId: deliveryId,
      newData: { supplier: "Hurtownia Północ", packages: 3 },
      oldData: null,
      channel: "WEB",
      serviceMode: false,
    });
    await expect(
      prisma.auditLog.count({ where: { organizationId: world.orgB.id } }),
    ).resolves.toBe(0);
  });
```

Plik z przebiegu ma jeszcze trzy przypadki: błędne wejście (brak dostawy i wpisu), superadmin w trybie serwisowym bez potwierdzenia (błąd „Potwierdź zmianę w trybie serwisowym”, brak dostawy i wpisu) i superadmin z potwierdzeniem (wpis z `serviceMode: true`). Wynik: `Tests  4 passed (4)`; po usunięciu wywołania `trackAudit` z komendy padają dwa z nich (sprawdzone), więc test łapie brak zapisu zdarzenia.

- `resetDatabase()` czyści tabele rdzenia z `CASCADE`, więc wpisy `audit_logs` i tabele funkcji powiązane z organizacją znikają razem z organizacjami.
- Projekt potrzebuje własnej bazy testowej z nazwą kończącą się na `_test`: `globalSetup` uruchamia `prisma db push` ze schematem projektu i odmówi, gdy baza ma tabele z danymi spoza tego schematu (na przykład po innym zestawie modułów). Szczegóły: [08](08-testy.md#baza-integracja).
- Wartości oczekiwane to literały (`"delivery.accepted"`, `{ supplier: "Hurtownia Północ", packages: 3 }`), nie wynik kodu produkcyjnego ([08b](08b-testy-adwersarialne.md)).

**Test z mockiem `trackAudit`.** Gdy test komendy nie potrzebuje wiersza w bazie, możesz podmienić tylko `trackAudit` i zostawić `auditActor`, tak jak `api-keys-isolation.integration.test.ts`:

`src/features/api-keys/services/__tests__/api-keys-isolation.integration.test.ts`

```ts
vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
}));
```

Taki test sprawdza treść zdarzenia, ale nie redakcję ani zapis. Nie mockuj `trackAudit` w teście, który ma pokazać, że wpis trafia do właściwej organizacji.

**Projekt bez modułu.** Test z prawdziwym `trackAudit` przechodzi, ale nie ma czego sprawdzić w bazie: tabeli `audit_logs` nie ma, a `auditSinks` jest puste. Treść zdarzenia sprawdzisz wtedy tylko mockiem `trackAudit`.

<a id="problemy"></a>

## Typowe problemy

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| Komenda się udaje, a wpisu w dzienniku nie ma; w logu `trackAudit failed` | Ujście rzuciło błąd (baza, klucz obcy organizacji). `trackAudit` go połknął. | Sprawdź błąd w logu i `organizationId` zdarzenia (z kontekstu, nie z wejścia). |
| Wpisu nie ma i w logu też nic | Projekt nie ma modułu (`auditSinks` puste) albo komenda nie woła `trackAudit` w tej ścieżce (na przykład po wcześniejszym `return`). | `npm run wa -- list`; sprawdź, czy wywołanie stoi po zapisie w każdej gałęzi sukcesu. |
| W tabeli surowy napis akcji zamiast etykiety | Brak deklaracji w `auditActions`. | Dodaj deklarację w `module.ts` feature, który zapisuje akcję. |
| Zamiast etykiety ścieżka klucza i błąd ``MISSING_MESSAGE: Could not resolve `<moduł>.<klucz>` `` | Deklaracja jest, brak klucza w `i18n/<język>.json`, plik tłumaczeń nie jest w rejestrze albo `key` modułu jest różny od nazwy katalogu feature (tłumaczenia są zarejestrowane pod nazwą katalogu). | Dodaj klucz w obu językach; po dodaniu nowego pliku tłumaczeń uruchom `npm run wa -- generate`; ustaw `key` równy nazwie katalogu. |
| `npm run verify` pada w teście kitu `pokazuje surowy action, gdy akcja nie ma deklaracji` (`Unable to find an element with the text: delivery.received`) | Moduł projektu zadeklarował akcję `delivery.received`, której test kitu używa jako niezadeklarowanej (sprawdzone). | Nazwij akcję inaczej, na przykład `delivery.accepted`. |
| `TS2307: Cannot find module '@/features/audit-logs/…'` | Kod importuje plik modułu, którego w projekcie nie ma (albo po `wa remove`). | `npm run wa -- add audit-logs` albo usuń import ([Bez modułu](#bez-modulu)). |
| `TypeError: Cannot read properties of undefined (reading 'create')` przy `prisma.auditLog` albo modelu funkcji | Klient Prismy nie zna nowego modelu: po `migrate dev` nie uruchomiono generatora (sprawdzone w przebiegu dla `prisma.delivery`). | `npm run db:generate`. |
| Filtr dat obejmuje inne godziny, niż widać w kolumnie daty | Filtr liczy dzień w strefie serwera, kolumna pokazuje czas przeglądarki ([Strefa czasowa](13-modul-audit-logs.md#strefa-czasowa)). | Ustaw `TZ` procesu serwera na strefę klienta albo uwzględnij przesunięcie przy wyborze dni. |
| Pole daty puste mimo `from` w adresie | Data nie istnieje w kalendarzu albo ma zły format; schemat ją odrzucił. | Podaj datę `RRRR-MM-DD`. |
| `wa remove audit-logs` kończy się `Moduł audit-logs jest wymagany przez: <moduł>` | Moduł projektu ma `audit-logs` w `requires`. | Usuń z tego modułu import `<AuditTrail>` i wpis w `requires` albo zostaw moduł. |
| Tabela `audit_logs` rośnie bez końca | Brak retencji. | Sprzątanie poza kitem (zadanie w bazie); moduł go nie dostarcza. |

<a id="referencja"></a>

## Referencja

Pola deklaracji modułu w `module.ts` (`key`, `nav`, `routePrefixes`, `roles`, `auditActions`): [Definicja modułu](13-modul-audit-logs.md#definicja-modulu).

<a id="referencja-zdarzenie"></a>

### Pola `AuditEvent`

| Pole | Typ | Wymagane | Domyślnie w zapisie | Kolumna |
| --- | --- | --- | --- | --- |
| `organizationId` | `string` | tak | | `organization_id` |
| `actorUserId` | `string \| null` | tak | | `user_id` |
| `action` | `string` | tak | | `action` |
| `entityType` | `string` | tak | | `entity_type` |
| `entityId` | `string \| null` | nie | `null` | `entity_id` |
| `oldData`, `newData` | `unknown` | nie | `NULL`, po redakcji | `old_data`, `new_data` |
| `channel` | `"WEB" \| "API"` | nie | `"WEB"` | `channel` |
| `credentialId` | `string \| null` | nie | `null` | `credential_id` |
| `serviceMode` | `boolean` | nie | `false` | `service_mode` |

<a id="referencja-akcje"></a>

### Akcje zadeklarowane w kicie

| Akcja | Moduł deklarujący | Etykieta `pl` |
| --- | --- | --- |
| `organization.entered` | `audit-logs` | Wejście do organizacji |
| `member.invited` | `audit-logs` | Zaproszenie członka |
| `invitation.canceled` | `audit-logs` | Anulowanie zaproszenia |
| `invitation.accepted` | `audit-logs` | Przyjęcie zaproszenia |
| `member.role_changed` | `audit-logs` | Zmiana roli członka |
| `member.removed` | `audit-logs` | Usunięcie członka |
| `api_key.created`, `api_key.revoked`, `api_key.deleted` | `api-keys` | [14](14-modul-api-keys.md) |
| `upload.created`, `upload.deleted` | `uploads` | [15](15-modul-uploads.md) |

Akcje rdzenia deklaruje `audit-logs`, a nie rdzeń: bez modułu nikt ich nie wyświetla.

<a id="referencja-parametry"></a>

### Parametry adresu `/audit-log`

| Parametr | Wartości | Zła wartość |
| --- | --- | --- |
| `page` | liczba całkowita 1–1 000 000 | `1` |
| `pageSize` | `10`, `25`, `50`, `100` | `25` |
| `sortBy` | `createdAt`, `action`, `entityType` | `createdAt` |
| `sortDir` | `asc`, `desc` | `desc` |
| `userId`, `action`, `entityType`, `entityId` | tekst 1–200 znaków po przycięciu, porównanie dokładne | pominięty |
| `from`, `to` | `RRRR-MM-DD`, dzień w strefie serwera, końce włącznie | pominięty |

<a id="referencja-komunikaty"></a>

### Komunikaty

| Komunikat | Gdzie | Znaczenie |
| --- | --- | --- |
| `trackAudit failed` (log `error`, pola `action` i `error`) | log serwera | Ujście rzuciło błąd; zdarzenie nie zostało zapisane przez to ujście. |
| Strona 404 na `/audit-log` | przeglądarka | Brak dostępu do modułu (rola `member`) albo modułu nie ma w rejestrze. |
| „Brak wpisów” | `/audit-log` | Filtry nie zwróciły wpisów. |
| „Brak historii” | `<AuditTrail>` | Encja nie ma wpisów w aktywnej organizacji. |
| `Moduł audit-logs jest wymagany przez: <lista>` | `wa remove` | Moduł projektu wymaga `audit-logs`. |
