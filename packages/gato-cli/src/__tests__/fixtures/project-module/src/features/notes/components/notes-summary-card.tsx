import { useTranslations } from "next-intl";

interface NotesSummaryCardProps {
  organizationId: string;
}

export default function NotesSummaryCard({
  organizationId,
}: NotesSummaryCardProps) {
  const t = useTranslations("notes");
  return (
    <section data-organization-id={organizationId}>
      <h2 className="text-lg font-semibold">{t("summary")}</h2>
    </section>
  );
}
