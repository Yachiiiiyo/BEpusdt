import { useQuery } from '@tanstack/react-query'
import { fetchAuthInfo } from '@/api/auth'

export function useAuthInfo() {
  return useQuery({
    queryKey: ['auth-info'],
    queryFn: fetchAuthInfo,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
