import { redirect } from "next/navigation";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { env } from "@/shared/lib/env";

interface SignUpPageProps {
  searchParams: Promise<{ invitationId?: string | string[] }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { invitationId } = await searchParams;
  const invitation =
    typeof invitationId === "string" ? invitationId : undefined;

  if (!env.AUTH_PUBLIC_SIGNUP && !invitation) {
    redirect("/sign-in");
  }

  return <SignUpForm invitationId={invitation} />;
}
