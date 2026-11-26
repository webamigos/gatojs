import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "uploads",
  nav: [],
  routePrefixes: [],
  auditActions: [
    { action: "upload.created", labelKey: "action-upload-created" },
    { action: "upload.deleted", labelKey: "action-upload-deleted" },
  ],
  commands: ["uploads.delete"],
  permissions: {
    "uploads.delete-others": {
      defaultRoles: ["owner", "admin"],
      labelKey: "permission-delete-others",
    },
  },
  uploadPurposes: [
    {
      key: "editor-image",
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 5 * 1024 * 1024,
      visibility: "public",
      resizeImage: { maxWidth: 1200 },
    },
  ],
});
