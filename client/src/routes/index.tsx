import { createFileRoute, redirect } from "@tanstack/react-router"

import { defaultLocale } from "@/i18n/locales"

// Temporary: `/` will pick the visitor's language (cookie, then browser)
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/$locale",
      params: { locale: defaultLocale },
      statusCode: 302,
    })
  },
})
