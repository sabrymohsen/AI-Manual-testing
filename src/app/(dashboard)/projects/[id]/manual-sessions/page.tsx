import { redirect } from "next/navigation"

// Past sessions live in Live QA History; a typed or old link lands there.
export default function ManualSessionsIndex({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/live-qa-history`)
}
