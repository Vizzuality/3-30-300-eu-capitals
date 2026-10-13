import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useParams,
} from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { MotionProvider } from "@/components/motion/motion-provider"
import { defaultLocale, isLocale } from "@/i18n/locales"
import appCss from "@/styles.css?url"

// Every loader can fill the query cache, so pages render with their data
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "icon",
          href: "/favicon.ico",
          sizes: "32x32",
        },
        {
          rel: "icon",
          href: "/icon.svg",
          type: "image/svg+xml",
        },
        {
          rel: "apple-touch-icon",
          href: "/apple-touch-icon.png",
        },
      ],
    }),
    shellComponent: RootDocument,
  }
)

function RootDocument({ children }: { children: React.ReactNode }) {
  // The page's language; an unknown one is a 404 page in English
  const { locale } = useParams({ strict: false })

  return (
    <html lang={locale && isLocale(locale) ? locale : defaultLocale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
