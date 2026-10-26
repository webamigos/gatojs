import { Button, Hr, Text } from "@react-email/components";
import { project } from "@/shared/config/project";
import { EmailLayout } from "./components/email-layout";

interface WelcomeSetPasswordEmailProps {
  name?: string;
  resetUrl: string;
}

export function WelcomeSetPasswordEmail({
  name,
  resetUrl,
}: WelcomeSetPasswordEmailProps) {
  return (
    <EmailLayout preview={`Witamy w ${project.name}`}>
      <Text className="text-base leading-6 text-[#525f7f]">
        {name ? `Cześć ${name},` : "Cześć,"}
      </Text>
      <Text className="text-base leading-6 text-[#525f7f]">
        Utworzono dla Ciebie konto w {project.name}. Aby dokończyć zakładanie
        konta, ustaw swoje hasło:
      </Text>
      <Button
        className="block w-full rounded-[5px] bg-[#1a1a2e] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
        href={resetUrl}
      >
        Ustaw hasło
      </Button>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-sm leading-5 text-[#8898aa]">
        Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją. Link jest ważny
        przez 48 godzin.
      </Text>
    </EmailLayout>
  );
}

export default WelcomeSetPasswordEmail;
