import type { Locale } from "./locales"
import type { Messages } from "./messages"

// Types the message keys from en.json: a missing or misspelt key fails the
// type check
declare module "use-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
