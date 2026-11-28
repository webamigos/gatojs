import { project } from "@/shared/config/project";

export const updatedAt = "2026-11-27";

export default function TermsEn() {
  return (
    <>
      <p>
        <strong>
          Template. Fill in the bracketed fields and have the text reviewed by a
          lawyer before you publish it.
        </strong>
      </p>

      <h2>1. About the service</h2>
      <p>
        These terms govern the use of {project.name} (the &quot;Service&quot;),
        provided by [company name], [address], [company registration number]
        (&quot;we&quot;). Contact: [contact e-mail].
      </p>
      <p>
        The Service lets you [describe what the Service does]. Using it requires
        a device with an up-to-date web browser and an internet connection.
      </p>

      <h2>2. Account</h2>
      <ul>
        <li>
          You need an account to use the Service. You create it by signing up or
          by accepting an invitation to an organization.
        </li>
        <li>
          You keep your password confidential and tell us at [contact e-mail]
          about any unauthorized use of your account.
        </li>
        <li>
          Organization owners and administrators decide who has access to the
          organization&apos;s data and are responsible for the people they
          invite.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>break the law or the rights of others while using the Service;</li>
        <li>
          upload content that is unlawful or that you have no right to share;
        </li>
        <li>
          try to access data or accounts that are not yours, or disrupt the
          Service (including automated attacks or excessive load);
        </li>
        <li>[other restrictions specific to the Service].</li>
      </ul>

      <h2>4. Fees</h2>
      <p>
        [Describe the plans, prices and billing, or state that the Service is
        free.]
      </p>

      <h2>5. Liability</h2>
      <p>
        We do our best to keep the Service available and secure, but we do not
        guarantee uninterrupted operation. To the extent permitted by law, we
        are not liable for indirect damages or lost profits. Nothing in these
        terms limits rights that consumers have under mandatory law.
      </p>

      <h2>6. Termination</h2>
      <p>
        You can stop using the Service and delete your account at any time. We
        may suspend or close an account that seriously or repeatedly breaks
        these terms, after notifying you at the e-mail address on the account
        unless the law or security requires immediate action.
      </p>

      <h2>7. Complaints</h2>
      <p>Send complaints to [contact e-mail]. We answer within [14] days.</p>

      <h2>8. Changes to these terms</h2>
      <p>
        We may change these terms for important reasons, such as a change in the
        law or in the Service. We announce changes at least [14] days in advance
        by e-mail or in the Service. The date of the last update is shown at the
        top of this page.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the law of [country]. Disputes are resolved
        by the competent courts of [country], subject to the mandatory rights of
        consumers.
      </p>
    </>
  );
}
