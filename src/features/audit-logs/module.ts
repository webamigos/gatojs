import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "audit-logs",
  nav: [
    { href: "/audit-log", labelKey: "nav", icon: "scroll-text", order: 90 },
  ],
  routePrefixes: ["/audit-log"],
  roles: ["owner", "admin"],
  auditActions: [
    { action: "organization.entered", labelKey: "action-organization-entered" },
    { action: "member.invited", labelKey: "action-member-invited" },
    { action: "invitation.canceled", labelKey: "action-invitation-canceled" },
    { action: "invitation.accepted", labelKey: "action-invitation-accepted" },
    { action: "member.role_changed", labelKey: "action-member-role-changed" },
    { action: "member.removed", labelKey: "action-member-removed" },
  ],
});
