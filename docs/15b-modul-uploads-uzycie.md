# Moduł `uploads`: użycie we własnym kodzie

Po przeczytaniu będziesz wiedzieć:

- jak zadeklarować własny cel uploadu, wstawić `<FileUpload>` do formularza i zapisać `id` pliku w encji z kontrolą organizacji;
- jak pokazać plik i usunąć go razem z encją;
- jakie zasady bezpieczeństwa i izolacji organizacji obowiązują przy plikach;
- jak przetestować funkcję z plikami na prawdziwym MinIO i jakie problemy pojawiają się najczęściej;
- jakie zmienne, trasy, cele, akcje i komunikaty ma moduł.

Zweryfikowano z kodem: d3710d3, 2026-10-30

Źródła:

- `src/features/uploads/` (`module.ts`, `env.ts`, `components/file-upload.tsx`, `services/`, `contracts/`, `i18n/`) z testami w `__tests__/`, w tym `services/__tests__/storage.integration.test.ts`, `services/__tests__/read-upload.integration.test.ts` i `services/__tests__/uploads-isolation.integration.test.ts`
- `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts`
- `src/shared/lib/modules/define-module.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`
- `src/test/integration/` (`setup-env.ts`, `database.ts`, `global-setup.ts`), `vitest.integration.config.ts`, `e2e/env.ts`
- `mutation-gate.json`

Ten plik jest drugą częścią opisu modułu `uploads`. Co moduł robi, jak go zainstalować, skonfigurować i usunąć, co dodaje do aplikacji i jakie ma punkty wejścia, opisuje [15-modul-uploads.md](15-modul-uploads.md). „(sprawdzone)” i „przykład z przebiegu” znaczą to samo co tam: przebieg z 2026-10-30 na projekcie `upload-demo` założonym z tagu `v0.1.0` z modułem `uploads` i z funkcją projektu `deliveries`, zakończony zielonym `npm run verify` i `npm run test:integration` ([opis przebiegu](15-modul-uploads.md#przebieg)).

<a id="uzycie"></a>

## Użycie z własnego kodu

Przykłady pochodzą z funkcji `deliveries` z przebiegu: magazynier przyjmuje dostawę ze zdjęciem, zdjęcie widzi tylko organizacja. Funkcja ma wpis w `projectModules` (`"requires": ["uploads"]`, wzorce `src/features/deliveries/**`, `src/app/[locale]/(app)/deliveries/**`, `prisma/schema/deliveries.prisma`, relacja `deliveries Delivery[]` w `Organization`); wpis, stronę i query opisuje tutorial [09](09-nowy-modul.md#krok-3) i [09b](09b-implementacja-i-bramki.md#komenda).

Początek wpisu `deliveries` w `.wa/kit.json` (przykład z przebiegu, fragment):

```json
// …
  "projectModules": {
    "deliveries": {
      "manifest": {
        "name": "deliveries",
        "version": "0.1.0",
        "description": "Funkcja projektu: dostawy ze zdjęciem",
        "requires": [
          "uploads"
        ],
// …
```

<a id="wlasny-cel"></a>

### Własny cel

`src/features/deliveries/module.ts` (przykład z przebiegu)

```ts
export default defineModule({
  key: "deliveries",
  nav: [{ href: "/deliveries", labelKey: "nav", icon: "truck", order: 50 }],
  routePrefixes: ["/deliveries"],
  uploadPurposes: [
    {
      key: "delivery-photo",
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 8 * 1024 * 1024,
      visibility: "organization",
      resizeImage: { maxWidth: 1600 },
    },
  ],
});
```

Zdjęcie dostawy to dane organizacji, więc cel ma `visibility: "organization"`; `"public"` wybieraj tylko dla treści dla każdego, bo adres publicznego pliku działa bez logowania i zostaje w cache do roku ([Pobieranie](15-modul-uploads.md#get)). `resizeImage` zmniejsza zdjęcia z telefonu do 1600 px i zapisuje je jako JPEG. Limit 8 MB podnosi limit trasy dla całej aplikacji ([Kontrakt celu](15-modul-uploads.md#cel-uploadu)). Po dodaniu `module.ts` uruchom `npm run wa -- generate`.

Klucz celu jest w kodzie w dwóch miejscach: w deklaracji i w komponencie. Funkcja z przebiegu trzyma go w stałej w `contracts/delivery.schemas.ts` (`export const DELIVERY_PHOTO_PURPOSE = "delivery-photo";`) i używa jej w formularzu i w komendzie.

<a id="formularz"></a>

### Formularz z `<FileUpload>`

`src/features/deliveries/components/receive-delivery-form.tsx` (przykład z przebiegu)

```tsx
export function ReceiveDeliveryForm() {
  const router = useRouter();
  const t = useTranslations("deliveries");
  const serviceModeAction = useServiceModeAction();
  const [supplier, setSupplier] = useState("");
  const [photoUploadId, setPhotoUploadId] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await serviceModeAction.run(receiveDeliveryCommand, {
      supplier,
      photoUploadId,
    });
    if (result === null) {
      return;
    }
    if (result.success) {
      toast.success(t("toast-received"));
      setSupplier("");
      setPhotoUploadId(null);
      setUploadKey((key) => key + 1);
      router.refresh();
    } else {
      toast.error(result.error ?? t("toast-receive-error"));
    }
  }
// …
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("photo-label")}</p>
        <FileUpload
          key={uploadKey}
          purpose={DELIVERY_PHOTO_PURPOSE}
          accept="image/jpeg,image/png,image/webp"
          onUploaded={(upload) => setPhotoUploadId(upload.id)}
        />
      </div>
```

- `<FileUpload>` zapisuje plik od razu po wyborze, a formularz trzyma tylko `id` z `onUploaded`. Plik wgrany i niezapisany w dostawie zostaje w buckecie ([Osierocone obiekty](15-modul-uploads.md#osierocone)).
- Zmiana `key` po zapisie montuje komponent od nowa, żeby zniknął podgląd poprzedniego zdjęcia.
- Komponent sam prosi o potwierdzenie trybu serwisowego przy wysyłce pliku, a zapis formularza idzie przez `serviceModeAction.run`, więc formularz nie dokłada własnego dialogu poza `{serviceModeAction.dialog}`.
- `accept` tylko podpowiada oknu wyboru pliku; serwer sprawdza typ z bajtów.

<a id="zapis-id"></a>

### Zapis `id` pliku w encji

Model dostawy ma kolumnę `photoUploadId String? @map("photo_upload_id") @db.Uuid`, bez relacji do `Upload`: moduł nie zna encji projektu, a funkcja nie dopisuje relacji do schematu modułu. Komenda musi więc sama sprawdzić, że `id` z wejścia wskazuje plik aktywnej organizacji i właściwego celu.

`src/features/deliveries/services/commands/delivery-commands.ts` (przykład z przebiegu)

```ts
export async function receiveDeliveryCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ deliveryId: string }>> {
  try {
    const context = await requireModuleAccess("deliveries");
    assertServiceModeConfirmed(context, confirmation);
    const parsed = receiveDeliverySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane",
      };
    }
    const { supplier, photoUploadId } = parsed.data;
    if (photoUploadId) {
      const photo = await prisma.upload.findFirst({
        where: {
          id: photoUploadId,
          organizationId: context.organizationId,
          purpose: DELIVERY_PHOTO_PURPOSE,
        },
        select: { id: true },
      });
      if (!photo) {
        throw new DomainError("Nie znaleziono zdjęcia dostawy");
      }
    }
    const delivery = await prisma.delivery.create({
      data: { organizationId: context.organizationId, supplier, photoUploadId },
      select: { id: true },
    });
    revalidatePath("/deliveries");
    return { success: true, data: { deliveryId: delivery.id } };
  } catch (error) {
    return handleCommandError(error, "Nie udało się przyjąć dostawy");
  }
}
```

Schemat wejścia: `supplier` 1–200 znaków po przycięciu, `photoUploadId: z.uuid().nullable()`. Bez warunku `organizationId` komenda zapisałaby w dostawie organizacji B zdjęcie organizacji A; użytkownik B i tak nie pobrałby pliku (404), ale encja wskazywałaby cudzy plik. Test „odrzuca id zdjęcia innej organizacji i nic nie zapisuje” padł po usunięciu tego warunku (sprawdzone). Warunek `purpose` nie pozwala podpiąć pliku wgranego do celu z inną widocznością albo innymi limitami.

<a id="pokazanie"></a>

### Pokazanie pliku

Adres pliku to zawsze `/api/uploads/<id>`; encja przechowuje samo `id`, a nie adres ani klucz obiektu.

`src/app/[locale]/(app)/deliveries/page.tsx` (przykład z przebiegu)

```tsx
              {delivery.photoUploadId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/uploads/${delivery.photoUploadId}`}
                  alt={delivery.supplier}
                  className="max-h-40"
                />
              ) : null}
```

Plik `organization` przeglądarka pobiera z ciasteczkiem sesji, więc działa w `<img>` na stronie aplikacji. Przykład używa `<img>` z wyłączoną regułą lintera, tak jak podgląd w `<FileUpload>`; działania `next/image` z tą trasą przebieg nie sprawdzał. Członek kilku organizacji zobaczy zdjęcie tylko po przełączeniu na organizację pliku.

<a id="usuwanie-z-encja"></a>

### Usuwanie pliku razem z encją

`src/features/deliveries/services/commands/delivery-commands.ts` (przykład z przebiegu, ciąg dalszy)

```ts
    // …
    await prisma.delivery.deleteMany({
      where: { id: delivery.id, organizationId: context.organizationId },
    });
    if (delivery.photoUploadId) {
      const removed = await deleteUploadCommand(
        { id: delivery.photoUploadId },
        confirmation,
      );
      if (!removed.success) {
        logger.warn("delivery photo left in storage", {
          uploadId: delivery.photoUploadId,
          error: removed.error,
        });
      }
    }
```

`deleteDeliveryCommand` przed tym fragmentem woła `requireModuleAccess("deliveries")`, `assertServiceModeConfirmed` i wyszukuje dostawę z filtrem `organizationId`. Potwierdzenie trybu serwisowego przekazuje dalej, bo `deleteUploadCommand` sprawdza je jeszcze raz. W teście integracyjnym usunięcie dostawy usunęło rekord pliku i obiekt z MinIO (sprawdzone), a test padł, gdy wywołanie `deleteUploadCommand` usunięto.

Kolejność ma skutki. `deleteUploadCommand` ma własne reguły ([Usuwanie](15-modul-uploads.md#usuwanie)): `member` nie usunie zdjęcia, które wgrał ktoś inny. Przykład usuwa najpierw dostawę, a niepowodzenie przy pliku tylko loguje, więc plik zostaje osierocony, ale dostawa znika. Jeśli wolisz zatrzymać usunięcie encji, gdy pliku nie da się usunąć, wołaj `deleteUploadCommand` przed usunięciem encji i przerwij przy błędzie.

Komenda z przebiegu nie pilnuje, żeby jeden plik był podpięty do jednej dostawy: to samo `photoUploadId` można zapisać w dwóch dostawach, a usunięcie jednej usunie plik, więc druga będzie wskazywać adres z 404. Dodaj unikalność kolumny (`@unique` na `photoUploadId`) albo przed `deleteUploadCommand` sprawdź, czy inne encje nie wskazują tego pliku.

<a id="bez-modulu"></a>

### Kod, który ma działać bez modułu

Deklaracja `uploadPurposes` buduje się i nie przeszkadza w projekcie bez `uploads`; zacznie działać po `wa add uploads`. `<FileUpload>` i `deleteUploadCommand` już nie: import z `@/features/uploads/` bez modułu kończy się `TS2307`. Zapytanie `prisma.upload.findFirst` też wymaga modułu, bo bez `prisma/schema/uploads.prisma` klient Prismy nie ma modelu `upload`. Funkcja z plikami ma więc `uploads` w `requires`, jak `deliveries` w przebiegu: `wa remove uploads` odmawia wtedy z komunikatem `Moduł uploads jest wymagany przez: deliveries` (sprawdzone).

<a id="bezpieczenstwo"></a>

## Bezpieczeństwo i izolacja organizacji

- **Organizacja z sesji.** Zapis bierze organizację z `getOrgContext()`; pole `organizationId` w formularzu jest ignorowane, a klucz obiektu zaczyna się od `orgs/<organizationId>/` ([Zapis](15-modul-uploads.md#post)).
- **Dostęp po rekordzie, nie po ścieżce.** Plik `organization` wydaje się tylko sesji z aktywną organizacją pliku; każdy inny przypadek to 404 bez zdradzania istnienia ([Pobieranie](15-modul-uploads.md#get)).
- **`public` znaczy publiczny.** Adres działa bez logowania i może zostać w cache przeglądarki i pośredników do roku; danych prywatnych nie wgrywaj do takiego celu ([D44](decyzje.md#d44)).
- **`id` pliku w encji sprawdza komenda projektu**: plik aktywnej organizacji i właściwego celu ([Zapis `id`](#zapis-id)).
- **Typ z bajtów, SVG, HTML i XML zakazane**, a odpowiedź z plikiem ma `X-Content-Type-Options: nosniff` i `Content-Security-Policy: sandbox; default-src 'none'`, więc plik nie wykona skryptu z domeny aplikacji ([Kontrakt celu](15-modul-uploads.md#cel-uploadu)).
- **Nazwa pliku w nagłówku** jest oczyszczona i zakodowana; znaki sterujące nie wejdą do `Content-Disposition` ([Pobieranie](15-modul-uploads.md#get)).
- **Obraz przechodzi przez `sharp`** z limitem 40 000 000 pikseli, a zapisany JPEG nie ma EXIF (w tym lokalizacji z telefonu) ([Obrazy](15-modul-uploads.md#obrazy)).
- **Limit rozmiaru przed odczytem ciała.** Za duże `Content-Length` i brak sesji kończą żądanie przed wczytaniem pliku; brak `Content-Length` daje 411 ([Zapis](15-modul-uploads.md#post)).
- **Tryb serwisowy** obowiązuje upload (potwierdzenie w formularzu) i `deleteUploadCommand` ([Potwierdzenie](15-modul-uploads.md#request-confirmation)).
- **Usuwanie** z filtrem `organizationId` i regułą autora; plik innej organizacji daje ten sam błąd co nieistniejący ([Usuwanie](15-modul-uploads.md#usuwanie)).
- **Osierocone obiekty** zostają w buckecie i nikt ich nie sprząta ([Osierocone obiekty](15-modul-uploads.md#osierocone)).
- **Sekrety S3** nie mają reguły przeciw wartościom przykładowym; ustaw własne na produkcji ([Zmienne S3](15-modul-uploads.md#zmienne-s3)).
- Katalog `src/features/uploads/services/` jest na liście `critical` bramki mutacji (`mutation-gate.json`, [D26](decyzje.md#d26)).

<a id="testowanie"></a>

## Testowanie własnego kodu z modułem

**MinIO w testach integracyjnych.** `src/test/integration/setup-env.ts` ustawia zmienne S3 dla testów integracyjnych: endpoint z `INTEGRATION_S3_ENDPOINT` (domyślnie `http://localhost:9000`), bucket z `INTEGRATION_S3_BUCKET` (domyślnie `<slug>-uploads`), klucze `minioadmin` i `S3_FORCE_PATH_STYLE=true`. Wartości `S3_*` z `.env` testów nie dotyczą. Lokalnie wartości domyślne pasują do MinIO z `docker-compose.yml` projektu (port 9000, bucket `<slug>-uploads` tworzony przez `minio-init`); przebieg nie uruchamiał Compose. MinIO na innym porcie wskazujesz zmienną środowiskową.

Uruchomienie z MinIO na porcie 9100:

```bash
INTEGRATION_S3_ENDPOINT=http://localhost:9100 npm run test:integration
```

Tak uruchomiono testy w przebiegu: `Test Files  5 passed (5)`, `Tests  74 passed (74)`, w tym trzy pliki integracyjne modułu (sprawdzone). Bucket musi istnieć przed testami; testy go nie tworzą. Test `storage.integration.test.ts` nie usuwa swoich obiektów: po przebiegu w buckecie zostały obiekty `orgs/o1/test/…` i `orgs/o2/test/…` (sprawdzone), więc nie wskazuj testom bucketu z danymi, które przeglądasz.

**Test integracyjny funkcji.** Test woła `createUpload` z prawdziwym plikiem PNG (zrobionym przez `sharp` w teście), komendy funkcji i `readUploadForDownload`, na prawdziwej bazie i MinIO. Mockuje tylko I/O frameworka (`next/headers`, `next/cache`, `next-intl/server`, `next/navigation`, `@/i18n/routing`) i sesję przez `vi.spyOn(auth.api, "getSession")`.

`src/features/deliveries/services/__tests__/delivery-photo.integration.test.ts` (przykład z przebiegu)

```ts
async function uploadPhoto(width: number): Promise<{ id: string; key: string }> {
  const png = await sharp({
    create: { width, height: 100, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  const formData = new FormData();
  formData.append(
    "file",
    new File([new Uint8Array(png)], "dostawa.png", { type: "image/png" }),
  );
  formData.append("purpose", "delivery-photo");
  const result = await createUpload(formData);
  expect(result.status).toBe(201);
  const id = "id" in result.body ? result.body.id : "";
  const record = await prisma.upload.findUniqueOrThrow({ where: { id } });
  writtenKeys.push(record.key);
  return { id, key: record.key };
}
// …
  it("zmniejsza zdjęcie do 1600 px jako JPEG i zapisuje id w dostawie", async () => {
    await signInAs(world.alice, world.orgA);
    const photo = await uploadPhoto(3000);

    const stored = await getObject(photo.key);
    const metadata = await sharp(stored?.body).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1600);
    expect(photo.key).toBe(
      `orgs/${world.orgA.id}/delivery-photo/${photo.id}.jpg`,
    );
// …
  it("odrzuca id zdjęcia innej organizacji i nic nie zapisuje", async () => {
    await signInAs(world.alice, world.orgA);
    const photo = await uploadPhoto(800);
    await signInAs(world.bob, world.orgB);

    const result = await receiveDeliveryCommand({
      supplier: "Hurtownia B",
      photoUploadId: photo.id,
    });

    expect(result).toEqual({
      success: false,
      error: "Nie znaleziono zdjęcia dostawy",
    });
    await expect(prisma.delivery.count()).resolves.toBe(0);
  });
```

`beforeEach` woła `resetDatabase()` i tworzy organizacje A i B z członkami `member`; `afterAll` usuwa zapisane obiekty przez `deleteObject`. Plik ma jeszcze dwa przypadki: zdjęcie organizacji A daje 200 z `Cache-Control: private, no-store` dla sesji A i 404 dla sesji B; usunięcie dostawy usuwa rekord pliku i obiekt (`getObject` zwraca `null`). Wynik: `Tests  4 passed (4)`. Kontrola siły testu (sprawdzone): po usunięciu warunku `organizationId` z wyszukania zdjęcia pada jeden przypadek, po usunięciu wywołania `deleteUploadCommand` jeden.

- Wartości oczekiwane to literały (`1600`, `"jpeg"`, `"private, no-store"`, klucz obiektu z szablonu ze specyfikacji), nie wynik kodu produkcyjnego ([08b](08b-testy-adwersarialne.md)).
- Test izolacji ma dwie organizacje i sprawdza, że sesja jednej nie podepnie ani nie odczyta pliku drugiej ([08](08-testy.md#izolacja)). Izolację samego modułu (zapis, odczyt, usuwanie) sprawdzają jego testy; test funkcji pokrywa jej własną regułę.
- Projekt potrzebuje własnej bazy z nazwą kończącą się na `_test`: `globalSetup` uruchamia `prisma db push` ze schematem projektu, które usuwa puste tabele spoza schematu, a odmawia, gdy dopasowanie skasowałoby dane ([08](08-testy.md#baza-integracja)). W przebiegu baza `upload_demo_runs_test` z `INTEGRATION_DATABASE_URL`.
- Bez `audit-logs` test nie potrzebuje mocka `trackAudit`: wywołanie nic nie zapisuje. Testy kitu mockują `trackAudit`, żeby sprawdzić treść zdarzenia.
- Test jednostkowy komponentu z `<FileUpload>` podmienia `fetch` (`vi.stubGlobal`) i renderuje go w `NextIntlClientProvider` i `ServiceModeProvider`, bo komponent woła `useServiceModeAction`; tak robi `file-upload.test.tsx`.
- E2E nie wysyła plików i nie ma MinIO w `e2e.yml` ([CI projektu](15-modul-uploads.md#ci)); upload w e2e wymaga własnego kroku z MinIO.

<a id="problemy"></a>

## Typowe problemy

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| Każda strona zwraca 500; w logu `Nieprawidłowe zmienne środowiskowe: S3_…` | Brak wymaganej zmiennej `S3_*` albo `S3_FORCE_PATH_STYLE` inna niż `true`/`false`, na przykład po `wa add` bez uzupełnienia `.env`. | Uzupełnij zmienne ([Zmienne S3](15-modul-uploads.md#zmienne-s3)). |
| Upload kończy się „Nie udało się przesłać pliku”; trasa zwraca 500 `storage_failed`, w logu `upload putObject failed` | Magazyn nieosiągalny, zły endpoint, klucze albo region, brak bucketu, `S3_FORCE_PATH_STYLE` nie pasuje do dostawcy. | Sprawdź MinIO (`docker compose up -d`, `minio-init`) albo dane magazynu produkcyjnego i bucket. |
| Każdy upload zwraca 500, w logu `Duplicate upload purpose key: …` albo `… declares forbidden type …` | Dwa cele z tym samym kluczem albo zakazany typ w `mimeTypes` (sprawdzone dla duplikatu). | Popraw deklarację celu ([Kontrakt celu](15-modul-uploads.md#cel-uploadu)). |
| 411 `length_required` | Klient wysyła ciało bez `Content-Length` (`Transfer-Encoding: chunked`, strumień) (sprawdzone). | Wysyłaj `FormData` z pliku, jak `<FileUpload>`. Przeglądarki w praktyce dodają wtedy `Content-Length`, ale Fetch Standard tego nie gwarantuje, a przebiegi tej dokumentacji sprawdzały trasę przez `curl`, nie przez przeglądarkę. Klient spoza przeglądarki musi ustawić nagłówek sam. |
| 413 dla pliku, który według systemu operacyjnego ma mniej niż limit | Limit celu jest w bajtach: `5 * 1024 * 1024` to 5 242 880 B (5 MiB), a menedżer plików może pokazywać megabajty dziesiętne albo zaokrąglać; albo plik idzie do innego celu niż zamierzony. | Sprawdź rozmiar pliku w bajtach, `maxBytes` i `purpose`. |
| 415 dla pliku CSV, TXT albo JSON | Formaty tekstowe nie mają sygnatury i `file-type` ich nie wykrywa. | Moduł ich nie przyjmuje; zmiana wymaga zmiany kodu modułu. |
| 415 dla obrazu z dobrym rozszerzeniem | Treść pliku jest innego typu (na przykład SVG albo HTML z rozszerzeniem `.png`) (sprawdzone). | Wgraj prawdziwy obraz. |
| 400 `unknown_purpose` | Cel nie jest zadeklarowany albo `module.ts` funkcji nie ma w rejestrze (sprawdzone dla nieznanego klucza). | Dodaj cel; dla nowego `module.ts` uruchom `npm run wa -- generate`. |
| Plik `organization` daje 404 zalogowanemu użytkownikowi | Aktywna jest inna organizacja niż organizacja pliku, użytkownik nie jest już członkiem albo obiekt zniknął z bucketu. | Przełącz organizację; dla danych potrzebnych szerzej zaprojektuj cel `public` świadomie. |
| Wgrany plik ma `mimeType` `image/jpeg`, a nazwa kończy się na `.png` | Cel z `resizeImage` zapisuje każdy obraz jako JPEG; `fileName` zostaje od klienta (sprawdzone). | To zamierzone; typ podaje `mimeType`. |
| „Brak uprawnień do usunięcia pliku” | `member` usuwa plik wgrany przez kogoś innego. | Usuwa autor, owner albo admin ([Usuwanie](15-modul-uploads.md#usuwanie)). |
| Bucket rośnie, choć użytkownicy usuwają dane | Osierocone obiekty ([lista sytuacji](15-modul-uploads.md#osierocone)). | Wołaj `deleteUploadCommand` przy usuwaniu encji; sprzątaj bucket porównaniem z kolumną `key`. |
| Testy integracyjne modułu padają z błędem połączenia albo błędem S3 | Pod `localhost:9000` nie ma MinIO projektu (inny kontener na tym porcie) albo nie ma bucketu `<slug>-uploads`. | Ustaw `INTEGRATION_S3_ENDPOINT` i `INTEGRATION_S3_BUCKET` na swój MinIO i utwórz bucket. |
| `TS2307: Cannot find module '@/features/uploads/…'` | Kod importuje plik modułu w projekcie bez modułu albo po `wa remove`. | `npm run wa -- add uploads` albo usuń import. |
| `wa remove uploads` kończy się `Moduł uploads jest wymagany przez: <moduł>` | Moduł projektu ma `uploads` w `requires` (sprawdzone). | Usuń z niego kod plików i wpis w `requires` albo zostaw moduł. |

<a id="referencja"></a>

## Referencja

Pola deklaracji modułu w `module.ts`: [Definicja modułu](15-modul-uploads.md#definicja-modulu); pole `uploadPurposes` dla własnego kodu: [Kontrakt celu](15-modul-uploads.md#cel-uploadu).

<a id="referencja-env"></a>

### Zmienne środowiskowe

| Zmienna | Wymagana | Reguła | Wartość w kicie |
| --- | --- | --- | --- |
| `S3_ENDPOINT` | tak | adres URL | `.env.example` i `.env` z `wa create`: `http://localhost:9000`; testy integracyjne: `INTEGRATION_S3_ENDPOINT` albo `http://localhost:9000`; e2e: `S3_ENDPOINT` albo `http://localhost:9000` |
| `S3_REGION` | nie | niepusta, domyślnie `auto` | `auto` |
| `S3_ACCESS_KEY_ID` | tak | niepusta | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | tak | niepusta | `minioadmin` |
| `S3_BUCKET` | tak | niepusta | `<slug>-uploads`; testy integracyjne: `INTEGRATION_S3_BUCKET` albo `<slug>-uploads` |
| `S3_FORCE_PATH_STYLE` | nie | `true` albo `false`, brak to `false` | `true` |
| `MINIO_PORT`, `MINIO_CONSOLE_PORT` | nie | czyta tylko Docker Compose | `9000`, `9001` |
| `INTEGRATION_S3_ENDPOINT`, `INTEGRATION_S3_BUCKET` | nie | czyta tylko `setup-env.ts` testów integracyjnych | brak (wartości domyślne jak wyżej) |

<a id="referencja-trasy"></a>

### Trasy API

| Trasa | Dostęp | Odpowiedzi |
| --- | --- | --- |
| `POST /api/uploads` | sesja z aktywną organizacją; w trybie serwisowym z potwierdzeniem | 201 `{ id, url, fileName, mimeType, size }`; 400 `invalid_input`, `unknown_purpose`, `empty`, `invalid_image`; 401 `unauthorized`; 403 `unauthorized` albo `Potwierdź zmianę w trybie serwisowym`; 411 `length_required`; 413 `too_large`; 415 `unsupported_type`; 500 `storage_failed` ([kolejność](15-modul-uploads.md#post)). |
| `GET /api/uploads/<id>` | plik `public` każdy; plik `organization` sesja z aktywną organizacją pliku | 200 z plikiem i nagłówkami `Content-Type`, `Content-Disposition`, `Cache-Control`, `X-Content-Type-Options`, `Content-Security-Policy`; 404 bez treści ([Pobieranie](15-modul-uploads.md#get)). |

<a id="referencja-cele"></a>

### Cele uploadu i akcje dziennika

| Napis | Rodzaj | Szczegóły |
| --- | --- | --- |
| `editor-image` | cel (kit) | `image/jpeg`, `image/png`, `image/webp`; 5 MiB; `public`; obrazy do 1200 px, JPEG |
| `upload.created` | akcja | Etykieta `pl` „Dodanie pliku” |
| `upload.deleted` | akcja | Etykieta `pl` „Usunięcie pliku” |

Typy zakazane w każdym celu: `image/svg+xml`, `text/html`, `application/xhtml+xml`, `application/xml`, `text/xml`.

<a id="referencja-komunikaty"></a>

### Komunikaty

| Komunikat | Gdzie | Znaczenie |
| --- | --- | --- |
| `Plik jest za duży` | `<FileUpload>`, tekst pod polem pliku | Odpowiedź 413. |
| `Nieobsługiwany typ pliku` | `<FileUpload>`, tekst pod polem pliku | Odpowiedź 415. |
| `Nie udało się przesłać pliku` | `<FileUpload>`, tekst pod polem pliku | Każdy inny błąd, także 403 trybu serwisowego i awaria sieci. |
| `Potwierdź zmianę w trybie serwisowym` | odpowiedź `POST /api/uploads` (403), wynik `deleteUploadCommand` | Brak albo nieaktualne potwierdzenie ([Potwierdzenie](15-modul-uploads.md#request-confirmation)). |
| `Nie udało się usunąć pliku` | wynik `deleteUploadCommand` | Nieprawidłowe `id`, plik innej organizacji, plik nieistniejący albo błąd bazy. |
| `Brak uprawnień do usunięcia pliku` | wynik `deleteUploadCommand` | `member` usuwa cudzy plik. |
| `upload putObject failed` (log `error`, pole `err`) | log serwera | Zapis obiektu się nie powiódł; odpowiedź 500. |
| `upload record create failed` (log `error`, pole `err`) | log serwera | Zapis rekordu się nie powiódł; obiekt jest cofany. |
| `upload rollback failed` (log `error`, pola `err`, `key`) | log serwera | Cofnięcie obiektu się nie powiodło; obiekt jest osierocony. |
| `upload deleteObject failed` (log `error`, pola `err`, `key`) | log serwera | Usunięcie obiektu się nie powiodło; rekord usunięty, obiekt osierocony. |
| `Duplicate upload purpose key: <key>` | log serwera, 500 | Powtórzony klucz celu. |
| `Upload purpose <key> declares forbidden type <typ>` | log serwera, 500 | Zakazany typ w celu. |
| `Moduł uploads jest wymagany przez: <lista>` | `wa remove` | Moduł projektu wymaga `uploads`. |
