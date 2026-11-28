"use client";

import { useState } from "react";
import { pl, enUS } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRouter } from "@/i18n/routing";
import { clientModules } from "@/modules.client.generated";
import { PageHeader } from "@/shared/components/page-header";
import { useServiceModeAction } from "@/shared/components/service-mode/use-service-mode-action";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { OperationResult } from "@/shared/types/common";
import type { ApiKeyRow } from "../contracts/api-key.types";
import {
  createApiKeyCommand,
  deleteApiKeyCommand,
  revokeApiKeyCommand,
} from "../services/commands/api-key-commands";
import { findApiScopeLabel } from "./api-scope-labels";
import { buildApiKeyColumns } from "./api-key-columns";

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { pl, en: enUS };
const registry: readonly ModuleDef[] = clientModules;

type ExpiryDays = 30 | 90 | 365 | null;
type ExpiryOptionValue = "30" | "90" | "365" | "never";

const EXPIRY_OPTIONS: {
  value: ExpiryOptionValue;
  days: ExpiryDays;
  labelKey: string;
}[] = [
  { value: "30", days: 30, labelKey: "expiry-30" },
  { value: "90", days: 90, labelKey: "expiry-90" },
  { value: "365", days: 365, labelKey: "expiry-365" },
  { value: "never", days: null, labelKey: "expiry-never" },
];

function expiryOptionValue(days: ExpiryDays): ExpiryOptionValue {
  return days === null ? "never" : (String(days) as ExpiryOptionValue);
}

function expiryDaysOf(value: ExpiryOptionValue): ExpiryDays {
  return EXPIRY_OPTIONS.find((option) => option.value === value)?.days ?? null;
}

const DEFAULT_EXPIRY: ExpiryDays = 90;

const declaredScopes = registry.flatMap(
  (moduleDef) => moduleDef.apiScopes ?? [],
);

export function ApiKeysManager({ keys }: { keys: ApiKeyRow[] }) {
  const router = useRouter();
  const t = useTranslations("api-keys");
  const root = useTranslations();
  const locale = useLocale();
  const { run, dialog } = useServiceModeAction();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] =
    useState<ExpiryDays>(DEFAULT_EXPIRY);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  function scopeLabel(scope: string): string {
    const found = findApiScopeLabel(scope, registry);
    return found ? root(`${found.namespace}.${found.labelKey}`) : scope;
  }

  async function execute<T>(
    action: () => Promise<OperationResult<T> | null>,
    onSuccess: (data: T | undefined) => void,
  ) {
    setBusy(true);
    try {
      const result = await action();
      if (result === null) {
        return;
      }
      if (result.success) {
        onSuccess(result.data);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    return execute(
      () => run(createApiKeyCommand, { name, scopes, expiresInDays }),
      (data) => {
        setSecret(data?.plaintext ?? null);
        setName("");
        setScopes([]);
        setExpiresInDays(DEFAULT_EXPIRY);
        setFormOpen(false);
      },
    );
  }

  function handleRevoke(key: ApiKeyRow) {
    if (!window.confirm(t("revoke-confirm", { name: key.name }))) {
      return;
    }
    return execute(
      () => run(revokeApiKeyCommand, { id: key.id }),
      () => toast.success(t("revoked-success")),
    );
  }

  function handleDelete(key: ApiKeyRow) {
    if (!window.confirm(t("delete-confirm", { name: key.name }))) {
      return;
    }
    return execute(
      () => run(deleteApiKeyCommand, { id: key.id }),
      () => toast.success(t("deleted-success")),
    );
  }

  function toggleScope(scope: string, checked: boolean) {
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((item) => item !== scope),
    );
  }

  async function copySecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy-error"));
    }
  }

  const columns = buildApiKeyColumns({
    t,
    scopeLabel,
    dateLocale: DATE_FNS_LOCALES[locale] ?? pl,
    now,
    pending: busy,
    onRevoke: handleRevoke,
    onDelete: handleDelete,
  });

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && !busy;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("create")}
          </Button>
        }
      />

      {keys.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <KeyRound className="mx-auto mb-2 h-8 w-8" />
          {t("empty")}
        </div>
      ) : (
        <DataTable columns={columns} data={keys} />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">{t("form-name")}</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("form-scopes")}
              </legend>
              {declaredScopes.map((scope) => {
                const id = `api-key-scope-${scope.key}`;
                const label = scopeLabel(scope.key);
                return (
                  <div key={scope.key} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      aria-label={label}
                      checked={scopes.includes(scope.key)}
                      onCheckedChange={(checked) =>
                        toggleScope(scope.key, checked)
                      }
                    />
                    <Label htmlFor={id}>{label}</Label>
                  </div>
                );
              })}
            </fieldset>
            <fieldset className="space-y-2">
              <legend
                id="api-key-expiry-legend"
                className="text-sm font-medium"
              >
                {t("form-expiry")}
              </legend>
              <RadioGroup
                aria-labelledby="api-key-expiry-legend"
                name="api-key-expiry"
                value={expiryOptionValue(expiresInDays)}
                onValueChange={(value: ExpiryOptionValue) =>
                  setExpiresInDays(expiryDaysOf(value))
                }
              >
                {EXPIRY_OPTIONS.map((option) => {
                  const id = `api-key-expiry-${option.value}`;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <RadioGroupItem id={id} value={option.value} />
                      <Label htmlFor={id}>{t(option.labelKey)}</Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </fieldset>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={!canSubmit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSecret(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("secret-title")}</DialogTitle>
            <DialogDescription>{t("secret-description")}</DialogDescription>
          </DialogHeader>
          {secret !== null && (
            <div className="space-y-3">
              <div className="break-all rounded-md bg-muted p-3 font-mono text-sm">
                {secret}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => copySecret(secret)}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("copy")}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>{t("secret-close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
