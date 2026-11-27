"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { legalConfig } from "../legal.config";
import type { CookieCategory, LegalConfig } from "../legal-config";
import {
  allChoices,
  isConsentValid,
  type ConsentChoices,
} from "../consent/consent-record";
import {
  onOpenCookieSettings,
  readConsent,
  writeConsent,
} from "../consent/consent-store";
import { useCookieConsent } from "../consent/use-cookie-consent";

type BannerView = "summary" | "choose";
type FocusTarget = "heading" | "first-option";

function storedChoices(config: LegalConfig): ConsentChoices {
  const record = readConsent();
  return record !== null && isConsentValid(record, config)
    ? record.choices
    : {};
}

function restoreFocus(target: Element | null): void {
  if (
    target instanceof HTMLElement &&
    target !== document.body &&
    target.isConnected
  ) {
    target.focus();
    return;
  }
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function CategoryOption({
  id,
  label,
  description,
  checked,
  locked = false,
  inputRef,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
        checked={checked}
        disabled={locked}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
    </li>
  );
}

export function CookieBanner({
  config = legalConfig,
  privacyHref,
}: {
  config?: LegalConfig;
  privacyHref?: string;
}): ReactNode {
  const t = useTranslations("legal");
  const consent = useCookieConsent(config);
  const baseId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<BannerView>("summary");
  const [draft, setDraft] = useState<ConsentChoices>({});
  const returnFocus = useRef<Element | null>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);

  const hasCategories = config.cookieCategories.length > 0;
  const visible =
    consent.ready && hasCategories && (consent.needsChoice || settingsOpen);

  useEffect(
    () =>
      onOpenCookieSettings(() => {
        returnFocus.current = document.activeElement;
        pendingFocus.current = "heading";
        setDraft(storedChoices(config));
        setView("choose");
        setSettingsOpen(true);
      }),
    [config],
  );

  useEffect(() => {
    if (visible && returnFocus.current === null) {
      returnFocus.current = document.activeElement;
    }
  }, [visible]);

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "heading") {
      headingRef.current?.focus();
    } else if (target === "first-option") {
      firstOptionRef.current?.focus();
    }
  });

  function finish() {
    const target = returnFocus.current;
    returnFocus.current = null;
    setSettingsOpen(false);
    setView("summary");
    setDraft({});
    restoreFocus(target);
  }

  function decideWith(choices: ConsentChoices) {
    writeConsent(choices, config);
    finish();
  }

  useEffect(() => {
    if (!visible || !settingsOpen) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        finish();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!visible) {
    return null;
  }

  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const choiceButtonClass = "min-w-32";

  function choose() {
    pendingFocus.current = "first-option";
    setDraft({});
    setView("choose");
  }

  function toggle(category: CookieCategory, checked: boolean) {
    setDraft((current) => ({ ...current, [category]: checked }));
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-x-0 bottom-0 z-50 p-4"
    >
      <div className="mx-auto grid max-w-3xl gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-lg sm:p-5">
        <div className="grid gap-1.5">
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            {t("banner-title")}
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {t("banner-description")}
          </p>
        </div>

        {view === "choose" && (
          <ul className="grid gap-3">
            <CategoryOption
              id={`${baseId}-essential`}
              label={t("category-essential")}
              description={t("category-essential-description")}
              checked
              locked
            />
            {config.cookieCategories.map((category, index) => (
              <CategoryOption
                key={category}
                id={`${baseId}-${category}`}
                label={t(`category-${category}`)}
                description={t(`category-${category}-description`)}
                checked={draft[category] === true}
                inputRef={index === 0 ? firstOptionRef : undefined}
                onChange={(checked) => toggle(category, checked)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {view === "summary" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className={choiceButtonClass}
                onClick={() => decideWith(allChoices(config, true))}
              >
                {t("banner-accept-all")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={choiceButtonClass}
                onClick={() => decideWith(allChoices(config, false))}
              >
                {t("banner-reject-all")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={choiceButtonClass}
                onClick={choose}
              >
                {t("banner-choose")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className={choiceButtonClass}
                onClick={() => decideWith(draft)}
              >
                {t("banner-save")}
              </Button>
              {settingsOpen && (
                <Button
                  type="button"
                  variant="ghost"
                  className={choiceButtonClass}
                  onClick={finish}
                >
                  {t("banner-close")}
                </Button>
              )}
            </>
          )}
          {privacyHref !== undefined && (
            <Link
              href={privacyHref}
              className="ml-auto text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("nav-privacy")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
