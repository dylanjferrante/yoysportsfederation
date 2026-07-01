'use client'

import { useParams } from 'next/navigation'
import FranchiseView from '@/components/FranchiseView'

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  return <FranchiseView teamId={id} />
}
