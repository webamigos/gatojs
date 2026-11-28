import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountNameForm } from "./account-name-form";

interface AccountDetailsProps {
  name: string | null;
  email: string;
}

export function AccountDetails({ name, email }: AccountDetailsProps) {
  const t = useTranslations("account");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("user-data")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AccountNameForm defaultName={name ?? ""} />
        <div>
          <p className="text-sm text-muted-foreground">{t("email")}</p>
          <p className="font-medium">{email}</p>
        </div>
      </CardContent>
    </Card>
  );
}
