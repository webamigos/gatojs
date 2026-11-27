import { project } from "@/shared/config/project";
import { CookieSettingsButton } from "../components/cookie-settings-button";

export const updatedAt = "2026-11-27";

const essentialCookies = [
  {
    name: "better-auth.session_token",
    purpose: "Utrzymuje zalogowanie (na HTTPS z przedrostkiem __Secure-).",
    lifetime: "Do wygaśnięcia sesji (domyślnie 7 dni)",
  },
  {
    name: "better-auth.session_data",
    purpose: "Podpisana kopia sesji, która oszczędza odczyt z bazy danych.",
    lifetime: "5 minut",
  },
  {
    name: "better-auth.dont_remember",
    purpose:
      "Kończy sesję po zamknięciu przeglądarki, gdy nie wybierzesz opcji „zapamiętaj mnie”.",
    lifetime: "Sesja przeglądarki",
  },
  {
    name: "better-auth.admin_session",
    purpose:
      "Przechowuje własną sesję administratora, gdy działa jako inny użytkownik (tylko obsługa).",
    lifetime: "Do wygaśnięcia sesji",
  },
  {
    name: "NEXT_LOCALE",
    purpose: "Zapamiętuje wybrany język.",
    lifetime: "Sesja przeglądarki",
  },
  {
    name: "cookie_consent",
    purpose:
      "Zapisuje Twój wybór dotyczący plików cookie (tylko gdy używamy opcjonalnych plików cookie).",
    lifetime: "180 dni",
  },
];

export default function PrivacyPl() {
  return (
    <>
      <p>
        <strong>
          Szablon. Uzupełnij pola w nawiasach kwadratowych i przed publikacją
          daj tekst do sprawdzenia prawnikowi.
        </strong>
      </p>

      <h2>1. Administrator danych</h2>
      <p>
        Administratorem danych osobowych przetwarzanych w {project.name} jest
        [nazwa firmy], [adres], [NIP / KRS]. Kontakt w sprawach ochrony danych:
        [adres e-mail do kontaktu]. [Inspektor ochrony danych: imię, nazwisko i
        e-mail, jeśli został wyznaczony.]
      </p>

      <h2>2. Jakie dane przetwarzamy i dlaczego</h2>
      <ul>
        <li>
          Dane konta (imię, adres e-mail, skrót hasła), żeby założyć i
          utrzymywać konto oraz świadczyć usługę: art. 6 ust. 1 lit. b RODO
          (umowa).
        </li>
        <li>
          Członkostwo w organizacji i dodawane przez Ciebie treści, żeby
          świadczyć usługę Twojej organizacji: art. 6 ust. 1 lit. b RODO.
        </li>
        <li>
          Dane techniczne (adres IP, przeglądarka, czas logowania, logi), żeby
          zapewnić bezpieczeństwo usługi i wyjaśniać nadużycia: art. 6 ust. 1
          lit. f RODO (prawnie uzasadniony interes).
        </li>
        <li>
          [Inne cele, np. wystawianie faktur: art. 6 ust. 1 lit. c RODO
          (obowiązek prawny).]
        </li>
      </ul>

      <h2>3. Odbiorcy i podmioty przetwarzające</h2>
      <p>
        Dane przekazujemy tylko dostawcom, którzy przetwarzają je w naszym
        imieniu na podstawie umowy powierzenia: [dostawca hostingu], [dostawca
        wysyłki e-maili], [dostawca przechowywania plików], [inne podmioty].
        [Przekazywanie poza EOG: opisz zabezpieczenia albo wpisz, że nie
        występuje.]
      </p>

      <h2>4. Okres przechowywania</h2>
      <p>
        Dane konta przechowujemy, dopóki konto istnieje, i usuwamy je w ciągu
        [30] dni od usunięcia konta, chyba że prawo wymaga dłuższego
        przechowywania. Logi przechowujemy przez [okres].
      </p>

      <h2>5. Twoje prawa</h2>
      <p>
        Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia
        przetwarzania, przenoszenia oraz sprzeciwu wobec przetwarzania opartego
        na prawnie uzasadnionym interesie. Zgodę, jeśli jest podstawą
        przetwarzania, możesz wycofać w każdej chwili; nie wpływa to na
        wcześniejsze przetwarzanie. Napisz na [adres e-mail do kontaktu]. Masz
        też prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych
        (PUODO), ul. Stawki 2, 00-193 Warszawa.
      </p>

      <h2>6. Pliki cookie</h2>
      <p>
        Usługa używa tylko plików cookie wymienionych niżej. Są niezbędne do jej
        działania, więc nie wymagają Twojej zgody.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Plik cookie</th>
            <th scope="col">Cel</th>
            <th scope="col">Czas przechowywania</th>
          </tr>
        </thead>
        <tbody>
          {essentialCookies.map((cookie) => (
            <tr key={cookie.name}>
              <td>
                <code>{cookie.name}</code>
              </td>
              <td>{cookie.purpose}</td>
              <td>{cookie.lifetime}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        [Jeśli używasz opcjonalnych plików cookie (preferencje, analityka,
        marketing), wymień je tutaj z dostawcą, celem i czasem przechowywania.
        Ustawiamy je dopiero po Twojej zgodzie.]
      </p>
      <CookieSettingsButton label="page" variant="button" />

      <h2>7. Zmiany polityki</h2>
      <p>
        Aktualizujemy politykę, gdy zmienia się sposób przetwarzania danych.
        Datę ostatniej aktualizacji podajemy na górze tej strony.
      </p>
    </>
  );
}
