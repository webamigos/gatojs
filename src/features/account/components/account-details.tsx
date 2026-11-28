import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AccountDetailsProps {
  name: string | null;
  email: string;
}

export function AccountDetails({ name, email }: AccountDetailsProps) {
  const t = useTranslations("account");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("user-data")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("name")}</p>
            <p className="font-medium">{name || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("email")}</p>
            <p className="font-medium">{email}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
