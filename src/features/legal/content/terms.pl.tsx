import { project } from "@/shared/config/project";

export const updatedAt = "2026-11-27";

export default function TermsPl() {
  return (
    <>
      <p>
        <strong>
          Szablon. Uzupełnij pola w nawiasach kwadratowych i przed publikacją
          daj tekst do sprawdzenia prawnikowi.
        </strong>
      </p>

      <h2>1. Usługa</h2>
      <p>
        Regulamin określa zasady korzystania z {project.name} (dalej „Usługa”),
        którą świadczy [nazwa firmy], [adres], [NIP / KRS] (dalej „my”).
        Kontakt: [adres e-mail do kontaktu].
      </p>
      <p>
        Usługa pozwala [opis tego, co robi Usługa]. Do korzystania z niej
        potrzebujesz urządzenia z aktualną przeglądarką internetową i dostępu do
        internetu.
      </p>

      <h2>2. Konto</h2>
      <ul>
        <li>
          Do korzystania z Usługi potrzebujesz konta. Zakładasz je przez
          rejestrację albo przez przyjęcie zaproszenia do organizacji.
        </li>
        <li>
          Nie udostępniasz nikomu hasła i informujesz nas pod adresem [adres
          e-mail do kontaktu] o każdym nieuprawnionym użyciu konta.
        </li>
        <li>
          Właściciele i administratorzy organizacji decydują, kto ma dostęp do
          jej danych, i odpowiadają za osoby, które zapraszają.
        </li>
      </ul>

      <h2>3. Zasady korzystania</h2>
      <p>Nie wolno:</p>
      <ul>
        <li>naruszać prawa ani praw innych osób przy korzystaniu z Usługi;</li>
        <li>
          umieszczać treści niezgodnych z prawem albo takich, do których nie
          masz praw;
        </li>
        <li>
          próbować dostać się do cudzych danych lub kont ani zakłócać działania
          Usługi (w tym atakami automatycznymi i nadmiernym obciążeniem);
        </li>
        <li>[inne ograniczenia właściwe dla Usługi].</li>
      </ul>

      <h2>4. Opłaty</h2>
      <p>
        [Opisz plany, ceny i rozliczenia albo wpisz, że Usługa jest bezpłatna.]
      </p>

      <h2>5. Odpowiedzialność</h2>
      <p>
        Dbamy o dostępność i bezpieczeństwo Usługi, ale nie gwarantujemy jej
        nieprzerwanego działania. W granicach dozwolonych przez prawo nie
        odpowiadamy za szkody pośrednie ani utracone korzyści. Regulamin nie
        ogranicza praw, które konsumentom dają bezwzględnie obowiązujące
        przepisy.
      </p>

      <h2>6. Zakończenie korzystania</h2>
      <p>
        W każdej chwili możesz przestać korzystać z Usługi i usunąć konto.
        Możemy zawiesić lub zamknąć konto, które poważnie albo uporczywie
        narusza regulamin, po wcześniejszej informacji na adres e-mail konta,
        chyba że prawo lub bezpieczeństwo wymaga natychmiastowego działania.
      </p>

      <h2>7. Reklamacje</h2>
      <p>
        Reklamacje wysyłaj na adres [adres e-mail do kontaktu]. Odpowiadamy w
        ciągu [14] dni.
      </p>

      <h2>8. Zmiany regulaminu</h2>
      <p>
        Możemy zmienić regulamin z ważnych przyczyn, na przykład po zmianie
        prawa albo Usługi. O zmianach informujemy co najmniej [14] dni wcześniej
        e-mailem lub w Usłudze. Datę ostatniej aktualizacji podajemy na górze
        tej strony.
      </p>

      <h2>9. Prawo właściwe</h2>
      <p>
        Regulamin podlega prawu [polskiemu]. Spory rozstrzygają właściwe sądy
        [polskie], z zachowaniem bezwzględnie obowiązujących praw konsumentów.
      </p>
    </>
  );
}
