"use client";

import { useCallback, useEffect, useState } from "react";
import type { Updater, VisibilityState } from "@tanstack/react-table";

const STORAGE_PREFIX = "data-table:columns:";

function readStoredVisibility(
  storageKey: string | undefined,
  defaultVisibility: VisibilityState,
): VisibilityState {
  if (!storageKey) {
    return defaultVisibility;
  }
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    return raw
      ? { ...defaultVisibility, ...(JSON.parse(raw) as VisibilityState) }
      : defaultVisibility;
  } catch {
    return defaultVisibility;
  }
}

function writeStoredVisibility(
  storageKey: string | undefined,
  visibility: VisibilityState,
) {
  if (!storageKey) {
    return;
  }
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${storageKey}`,
      JSON.stringify(visibility),
    );
  } catch {
    // Private browsing mode or exceeded storage quota: skip persistence for
    // this session rather than surfacing an error to the user.
  }
}

const NO_DEFAULT_VISIBILITY: VisibilityState = {};

export function useColumnVisibility(
  storageKey?: string,
  defaultVisibility: VisibilityState = NO_DEFAULT_VISIBILITY,
): [VisibilityState, (updater: Updater<VisibilityState>) => void] {
  const [visibility, setVisibility] =
    useState<VisibilityState>(defaultVisibility);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibility(readStoredVisibility(storageKey, defaultVisibility));
  }, [storageKey, defaultVisibility]);

  const handleChange = useCallback(
    (updater: Updater<VisibilityState>) => {
      setVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        writeStoredVisibility(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return [visibility, handleChange];
}
