"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
import { ORG_ROLES } from "@/shared/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type {
  OrganizationInvitationRow,
  OrganizationMemberRow,
} from "../contracts/organization-members.types";

interface OrganizationMembersProps {
  organizationName: string;
  currentUserId: string;
  currentRole: string;
  members: OrganizationMemberRow[];
  invitations: OrganizationInvitationRow[];
}

const ASSIGNABLE_ROLES = [ORG_ROLES.ADMIN, ORG_ROLES.MEMBER] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function OrganizationMembers({
  organizationName,
  currentUserId,
  currentRole,
  members,
  invitations,
}: OrganizationMembersProps) {
  const t = useTranslations("organizations");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const canManage =
    currentRole === ORG_ROLES.OWNER || currentRole === ORG_ROLES.ADMIN;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>(
    ORG_ROLES.MEMBER,
  );
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === "pending",
  );

  async function runMutation(
    id: string,
    mutation: () => Promise<{ error: { message?: string } | null }>,
    successMessage: string,
  ) {
    setBusyId(id);
    try {
      const result = await mutation();
      if (result.error) {
        toast.error(result.error.message ?? t("toast-generic-error"));
        return;
      }
      toast.success(successMessage);
      router.refresh();
    } catch {
      toast.error(t("toast-generic-error"));
    } finally {
      setBusyId(null);
    }
  }

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    setInviting(true);
    try {
      const result = await authClient.organization.inviteMember({
        email,
        role: inviteRole,
      });
      if (result.error) {
        toast.error(result.error.message ?? t("toast-invite-error"));
        return;
      }
      toast.success(t("toast-invited", { email }));
      setInviteEmail("");
      router.refresh();
    } catch {
      toast.error(t("toast-invite-error"));
    } finally {
      setInviting(false);
    }
  }

  function onCancelInvitation(invitationId: string) {
    return runMutation(
      invitationId,
      () => authClient.organization.cancelInvitation({ invitationId }),
      t("toast-invitation-cancelled"),
    );
  }

  function onRemoveMember(member: OrganizationMemberRow) {
    if (!window.confirm(t("remove-confirm", { name: member.name }))) {
      return;
    }
    return runMutation(
      member.memberId,
      () =>
        authClient.organization.removeMember({
          memberIdOrEmail: member.memberId,
        }),
      t("toast-member-removed"),
    );
  }

  function onChangeRole(member: OrganizationMemberRow, role: AssignableRole) {
    return runMutation(
      member.memberId,
      () =>
        authClient.organization.updateMemberRole({
          memberId: member.memberId,
          role,
        }),
      t("toast-role-changed"),
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{organizationName}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("members-title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isOwnerRow = member.role === ORG_ROLES.OWNER;
              return (
                <li
                  key={member.memberId}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {member.name}
                      {isSelf && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({t("you")})
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                  {canManage && !isOwnerRow && !isSelf ? (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          value &&
                          value !== member.role &&
                          onChangeRole(member, value as AssignableRole)
                        }
                      >
                        <SelectTrigger
                          className="w-36"
                          disabled={busyId === member.memberId}
                        >
                          <span>{t(`role.${member.role}`)}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`role.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === member.memberId}
                        onClick={() => onRemoveMember(member)}
                      >
                        {t("remove")}
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t(`role.${member.role}`)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("invite-title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              onSubmit={onInvite}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="invite-email">{t("invite-email")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("invite-role")}</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) =>
                    value && setInviteRole(value as AssignableRole)
                  }
                >
                  <SelectTrigger className="w-36">
                    <span>{t(`role.${inviteRole}`)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`role.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? t("inviting") : t("invite-submit")}
              </Button>
            </form>

            {pendingInvitations.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("pending-invitations")}
                </p>
                <ul className="divide-y">
                  {pendingInvitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center gap-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {invitation.email}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`role.${invitation.role}`)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === invitation.id}
                        onClick={() => onCancelInvitation(invitation.id)}
                      >
                        {tCommon("cancel")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
