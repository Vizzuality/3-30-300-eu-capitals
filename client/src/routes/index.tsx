import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: Home })

// Placeholder until the pages are built
function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <h1 className="text-2xl font-medium">3-30-300</h1>
    </main>
  )
}
