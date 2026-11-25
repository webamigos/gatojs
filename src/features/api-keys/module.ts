import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "api-keys",
  nav: [
    {
      id: "api-keys.list",
      href: "/api-keys",
      labelKey: "nav",
      icon: "key-round",
      order: 85,
    },
  ],
  routePrefixes: ["/api-keys"],
  roles: ["owner", "admin"],
  apiScopes: [
    { key: "organization:read", labelKey: "scopes.organizationRead" },
  ],
  auditActions: [
    { action: "api_key.created", labelKey: "action-api-key-created" },
    { action: "api_key.revoked", labelKey: "action-api-key-revoked" },
    { action: "api_key.deleted", labelKey: "action-api-key-deleted" },
  ],
});
