import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { authMessages } from "./messages";

export function renderAuthForm(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="pl" messages={authMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
