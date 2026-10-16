import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { locales } from "./src/i18n/locales.ts"
import { capitalSlugs } from "./src/lib/capitals.ts"

// Every page in every language: 24 × (Home, Methodology, About, 27 capitals)
const pages = locales.flatMap((locale) =>
  [
    `/${locale}`,
    `/${locale}/methodology`,
    `/${locale}/about`,
    ...capitalSlugs.map((slug) => `/${locale}/capitals/${slug}`),
  ].map((path) => ({ path }))
)

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    // The map's renderer (deck.gl and its layers) is one chunk of its own,
    // loaded lazily with the map, never with the first page, whose budget
    // it does not count against: the warning watches the other chunks
    chunkSizeWarningLimit: 700,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      // Pages are written to HTML at build time; `/` stays a redirect
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
      pages,
    }),
    viteReact(),
  ],
})

export default config
