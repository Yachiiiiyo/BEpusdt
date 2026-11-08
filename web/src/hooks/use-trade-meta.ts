import { useMemo } from 'react'
import { useAuthInfo } from '@/hooks/use-auth-info'
import { toKeys, toOptions } from '@/lib/trade-meta'

/**
 * 便捷读取 /api/auth/info 中的交易元数据。
 * 后端返回的四个字段都是对象(map)，这里统一规范成数组，页面可直接 .map。
 * - tradeTypes / tradeNetworks: { value, label }[]
 * - tradeFiats / tradeCryptos:  string[]（代码）
 */
export function useTradeMeta() {
  const { data, isLoading } = useAuthInfo()

  return useMemo(
    () => ({
      isLoading,
      tradeTypes: toOptions(data?.trade_type),
      tradeNetworks: toOptions(data?.trade_network),
      tradeFiats: toKeys(data?.trade_fiat),
      tradeCryptos: toKeys(data?.trade_crypto),
    }),
    [data, isLoading],
  )
}
