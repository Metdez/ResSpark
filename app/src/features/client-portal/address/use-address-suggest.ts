import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { suggestAddresses, type AddressSuggestion } from './address-api'

// T-06-14: 3-character minimum, 250 ms debounce, 60 s cache; the Worker also caps 30 calls/min.
export function useAddressSuggest(input: string, selected: string | null, enabled: boolean) {
  const [q, setQ] = useState(input.trim())
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250)
    return () => clearTimeout(t)
  }, [input])
  const query = useQuery({
    queryKey: ['portal', 'address', q, selected],
    queryFn: () => suggestAddresses(q, selected ?? undefined),
    enabled: enabled && q.length >= 3,
    retry: false,
    staleTime: 60_000,
  })
  // A failed call (a 429 above all) keeps the last list on screen instead of blanking it.
  const [last, setLast] = useState<AddressSuggestion[]>([])
  if (query.data && query.data !== last) setLast(query.data)
  const suggestions = q.length >= 3 ? (query.data ?? last) : []
  return { suggestions, isFetching: query.isFetching, error: query.error }
}
