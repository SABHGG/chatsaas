import { redirect } from 'next/navigation'

// The board is the only surface for now; later tasks build app/(board)/.
export default function RootPage() {
  redirect('/board')
}
