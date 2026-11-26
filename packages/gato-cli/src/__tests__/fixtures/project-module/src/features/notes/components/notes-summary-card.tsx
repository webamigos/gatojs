import { getTranslations } from "next-intl/server";
import { getOrgContext } from "@/shared/lib/auth/org-context";

interface NotesSummaryCardProps {
  organizationId: string;
}

export default async function NotesSummaryCard({
  organizationId,
}: NotesSummaryCardProps) {
  const { orgRole } = await getOrgContext();
  const t = await getTranslations("notes");
  return (
    <section data-organization-id={organizationId} data-org-role={orgRole}>
      <h2 className="text-lg font-semibold">{t("summary")}</h2>
    </section>
  );
}
