import { project } from "@/shared/config/project";
import { CookieSettingsButton } from "../components/cookie-settings-button";

export const updatedAt = "2026-11-27";

const essentialCookies = [
  {
    name: "better-auth.session_token",
    purpose: "Keeps you signed in (with the __Secure- prefix on HTTPS).",
    lifetime: "Until the session expires (7 days by default)",
  },
  {
    name: "better-auth.session_data",
    purpose: "A signed copy of the session that saves a database read.",
    lifetime: "5 minutes",
  },
  {
    name: "better-auth.dont_remember",
    purpose:
      "Ends the session when you close the browser if you did not choose to stay signed in.",
    lifetime: "Browser session",
  },
  {
    name: "better-auth.admin_session",
    purpose:
      "Keeps an administrator's own session while they act as another user (staff only).",
    lifetime: "Until the session expires",
  },
  {
    name: "NEXT_LOCALE",
    purpose: "Remembers the language you chose.",
    lifetime: "Browser session",
  },
  {
    name: "cookie_consent",
    purpose: "Stores your cookie choice (only when optional cookies are used).",
    lifetime: "180 days",
  },
];

export default function PrivacyEn() {
  return (
    <>
      <p>
        <strong>
          Template. Fill in the bracketed fields and have the text reviewed by a
          lawyer before you publish it.
        </strong>
      </p>

      <h2>1. Controller</h2>
      <p>
        The controller of personal data processed in {project.name} is [company
        name], [address], [company registration number]. Contact for data
        protection matters: [contact e-mail]. [Data protection officer: name and
        e-mail, if appointed.]
      </p>

      <h2>2. What data we process and why</h2>
      <ul>
        <li>
          Account data (name, e-mail address, password hash) to create and
          maintain your account and provide the service: Art. 6(1)(b) GDPR
          (contract).
        </li>
        <li>
          Organization membership and the content you add, to provide the
          service to your organization: Art. 6(1)(b) GDPR.
        </li>
        <li>
          Technical data (IP address, browser, sign-in times, logs) to keep the
          service secure and investigate abuse: Art. 6(1)(f) GDPR (legitimate
          interest).
        </li>
        <li>
          [Other purposes, e.g. invoicing: Art. 6(1)(c) GDPR (legal
          obligation).]
        </li>
      </ul>

      <h2>3. Recipients and processors</h2>
      <p>
        We share data only with providers who process it on our behalf under a
        data processing agreement: [hosting provider], [e-mail delivery
        provider], [file storage provider], [other processors]. [Transfers
        outside the EEA: describe the safeguards, or state that there are none.]
      </p>

      <h2>4. Retention</h2>
      <p>
        We keep account data while the account exists and delete it within [30]
        days after the account is deleted, unless the law requires us to keep it
        longer. Logs are kept for [period].
      </p>

      <h2>5. Your rights</h2>
      <p>
        You have the right to access your data, rectify it, erase it, restrict
        its processing, port it and object to processing based on legitimate
        interest. Where processing is based on consent, you may withdraw it at
        any time without affecting earlier processing. Write to [contact
        e-mail]. You also have the right to lodge a complaint with a supervisory
        authority, [name of the supervisory authority in your country].
      </p>

      <h2>6. Cookies</h2>
      <p>
        The service uses only the cookies listed below. They are strictly
        necessary for the service to work, so they do not require your consent.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Cookie</th>
            <th scope="col">Purpose</th>
            <th scope="col">Lifetime</th>
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
        [If you use optional cookies (preferences, analytics, marketing), list
        them here with their provider, purpose and lifetime. They are set only
        after you consent.]
      </p>
      <CookieSettingsButton label="page" variant="button" />

      <h2>7. Changes to this policy</h2>
      <p>
        We update this policy when the way we process data changes. The date of
        the last update is shown at the top of this page.
      </p>
    </>
  );
}
