import { redirect } from "@/i18n/routing";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { env } from "@/env";

interface SignUpPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ invitationId?: string | string[] }>;
}

export default async function SignUpPage({
  params,
  searchParams,
}: SignUpPageProps) {
  const { locale } = await params;
  const { invitationId } = await searchParams;
  const invitation =
    typeof invitationId === "string" ? invitationId : undefined;

  if (!env.AUTH_PUBLIC_SIGNUP && !invitation) {
    redirect({ href: "/sign-in", locale });
  }

  return <SignUpForm invitationId={invitation} />;
}
