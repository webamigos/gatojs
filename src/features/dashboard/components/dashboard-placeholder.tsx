import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardPlaceholderProps {
  userName: string;
}

export function DashboardPlaceholder({ userName }: DashboardPlaceholderProps) {
  const t = useTranslations("dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("welcome", { name: userName })}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t("placeholder")}</p>
      </CardContent>
    </Card>
  );
}
