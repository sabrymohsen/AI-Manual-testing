import { Lightning } from "@phosphor-icons/react/dist/ssr"

/** QA Engine wordmark for the dark website. */
export function Logo() {
  return (
    <span className="title-4 inline-flex items-center gap-2 text-white">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Lightning weight="fill" className="h-4 w-4" aria-hidden />
      </span>
      QA Engine
    </span>
  )
}
