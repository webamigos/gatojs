import { Button, Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/email-layout";

interface OrganizationInvitationEmailProps {
  organizationName: string;
  inviterName?: string;
  acceptUrl: string;
}

export function OrganizationInvitationEmail({
  organizationName,
  inviterName,
  acceptUrl,
}: OrganizationInvitationEmailProps) {
  return (
    <EmailLayout preview={`Zaproszenie do ${organizationName}`}>
      <Text className="text-base leading-6 text-[#525f7f]">Cześć,</Text>
      <Text className="text-base leading-6 text-[#525f7f]">
        {inviterName
          ? `${inviterName} zaprasza Cię do organizacji ${organizationName}.`
          : `Zaproszono Cię do organizacji ${organizationName}.`}
      </Text>
      <Button
        className="block w-full rounded-[5px] bg-[#1a1a2e] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
        href={acceptUrl}
      >
        Przyjmij zaproszenie
      </Button>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-sm leading-5 text-[#8898aa]">
        Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.
      </Text>
    </EmailLayout>
  );
}

export default OrganizationInvitationEmail;
