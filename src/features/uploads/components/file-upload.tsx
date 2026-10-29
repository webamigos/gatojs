"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useServiceModeAction } from "@/shared/components/service-mode/use-service-mode-action";
import type { UploadResponse } from "../contracts/upload.types";

interface FileUploadProps {
  purpose: string;
  accept?: string;
  onUploaded: (upload: UploadResponse) => void;
}

const ERROR_KEY_BY_STATUS: Record<number, string> = {
  413: "error-too-large",
  415: "error-unsupported-type",
};

export function FileUpload({ purpose, accept, onUploaded }: FileUploadProps) {
  const t = useTranslations("uploads");
  const { requestConfirmation, dialog } = useServiceModeAction();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);

  async function upload(file: File) {
    const confirmation = await requestConfirmation();
    if (confirmation === null) {
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("purpose", purpose);
    if (confirmation) {
      body.append("serviceModeConfirmation", JSON.stringify(confirmation));
    }
    try {
      const response = await fetch("/api/uploads", { method: "POST", body });
      if (response.status !== 201) {
        setPreview(null);
        setErrorKey(ERROR_KEY_BY_STATUS[response.status] ?? "error-generic");
        return;
      }
      const created = (await response.json()) as UploadResponse;
      setErrorKey(null);
      setPreview(created);
      onUploaded(created);
    } catch {
      setPreview(null);
      setErrorKey("error-generic");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept={accept}
        aria-label={t("file-label")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void upload(file);
          }
        }}
      />
      {errorKey ? (
        <p role="alert" className="text-sm text-destructive">
          {t(errorKey)}
        </p>
      ) : null}
      {preview?.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.url} alt={preview.fileName} className="max-h-40" />
      ) : null}
      {dialog}
    </div>
  );
}
