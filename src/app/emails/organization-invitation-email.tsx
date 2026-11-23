import { Button, Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/email-layout";

export interface OrganizationInvitationEmailText {
  preview: string;
  greeting: string;
  body: string;
  cta: string;
  footer: string;
}

interface OrganizationInvitationEmailProps {
  acceptUrl: string;
  text: OrganizationInvitationEmailText;
}

export function OrganizationInvitationEmail({
  acceptUrl,
  text,
}: OrganizationInvitationEmailProps) {
  return (
    <EmailLayout preview={text.preview}>
      <Text className="text-base leading-6 text-[#525f7f]">
        {text.greeting}
      </Text>
      <Text className="text-base leading-6 text-[#525f7f]">{text.body}</Text>
      <Button
        className="block w-full rounded-[5px] bg-[#1a1a2e] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
        href={acceptUrl}
      >
        {text.cta}
      </Button>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-sm leading-5 text-[#8898aa]">{text.footer}</Text>
    </EmailLayout>
  );
}

export default OrganizationInvitationEmail;
