import { redirect } from "@/i18n/routing";

interface LocaleHomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  redirect({ href: "/dashboard", locale });
}
