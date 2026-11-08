import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONFIG_URL_SCHEMES,
  RPC_FIELDS,
  RPC_URL_SCHEMES,
  STAT_NETWORKS,
  TRON_GRID_API_KEY,
  buildRpcSaveItems,
  formatBlockHeight,
  formatStatTime,
  parseStats,
  sortStatNetworks,
  successRateLevel,
  validateUrl,
} from '../src/lib/rpc.ts'

test('RPC_FIELDS / STAT_NETWORKS 配置键与 conf.go Rpc() 的 12 个键一一对应', () => {
  const goKeys = [
    'rpc_endpoint_plasma',
    'rpc_endpoint_bsc',
    'rpc_endpoint_solana',
    'rpc_endpoint_xlayer',
    'rpc_endpoint_polygon',
    'rpc_endpoint_arbitrum',
    'rpc_endpoint_ethereum',
    'rpc_endpoint_base',
    'rpc_endpoint_aptos',
    'rpc_endpoint_tron',
    'rpc_endpoint_tron_grid_api_key',
    'rpc_global_config_url_ton',
  ]
  const libKeys = [...RPC_FIELDS.map((f) => f.key), TRON_GRID_API_KEY]
  assert.deepEqual([...libKeys].sort(), [...goKeys].sort())
  assert.equal(new Set(libKeys).size, goKeys.length)

  assert.equal(STAT_NETWORKS.length, RPC_FIELDS.length)
  assert.deepEqual(
    [...STAT_NETWORKS.map((n) => n.key)].sort(),
    [...RPC_FIELDS.map((f) => f.key)].sort(),
  )
})

test('parseStats：真实响应形状（stats 为 map[string]info）', () => {
  const raw = {
    tron: { block: '58206123', succ: '100.00%', time: 1735641600 },
    ethereum: { block: '20534123', succ: '98.50%', time: 1735641599 },
  }
  assert.deepEqual(parseStats(raw), raw)
})

test('parseStats：null / 缺失 / 非法输入兜底为 {} 或跳过非法项', () => {
  assert.deepEqual(parseStats(null), {})
  assert.deepEqual(parseStats(undefined), {})
  assert.deepEqual(parseStats('x'), {})
  assert.deepEqual(parseStats([]), {})
  assert.deepEqual(parseStats({}), {})
  // 单项字段非法：block/succ 必须是字符串，time 非数字归 0
  assert.deepEqual(parseStats({ tron: null }), {})
  assert.deepEqual(parseStats({ tron: { block: '1', succ: '1%', time: 'x' } }), {
    tron: { block: '1', succ: '1%', time: 0 },
  })
  assert.deepEqual(parseStats({ tron: { block: 1, succ: '1%', time: 1 } }), {})
})

test('successRateLevel：阈值与旧版一致（>=95 好、>=80 一般、其余差）', () => {
  assert.equal(successRateLevel('100.00%'), 'good')
  assert.equal(successRateLevel('95%'), 'good')
  assert.equal(successRateLevel('94.99%'), 'warn')
  assert.equal(successRateLevel('80.00%'), 'warn')
  assert.equal(successRateLevel('79.99%'), 'bad')
  assert.equal(successRateLevel(undefined), 'bad')
  // parseFloat('abc') = NaN，旧版归入 dot-bad
  assert.equal(successRateLevel('abc'), 'bad')
})

test('formatBlockHeight：# + 千分位；空值/非法值', () => {
  assert.equal(formatBlockHeight('58206123'), '#58,206,123')
  assert.equal(formatBlockHeight('0'), '#0')
  assert.equal(formatBlockHeight(''), '')
  assert.equal(formatBlockHeight(undefined), '')
  assert.equal(formatBlockHeight('abc'), '#abc')
})

test('formatStatTime：秒级时间戳 -> YYYY/M/D HH:mm:ss；空值', () => {
  // 2024-01-01 00:00:00 UTC+8 = 1704038400
  const s = formatStatTime(1704038400)
  assert.match(s, /^2024\/1\/1 /)
  assert.equal(formatStatTime(0), '—')
  assert.equal(formatStatTime(undefined), '—')
})

test('sortStatNetworks：有数据的排前面（稳定排序）', () => {
  const stats = parseStats({ solana: { block: '1', succ: '1%', time: 1 } })
  const sorted = sortStatNetworks(STAT_NETWORKS, stats)
  assert.equal(sorted[0].statKey, 'solana')
  // 其余保持原相对顺序
  assert.deepEqual(
    sorted.slice(1).map((n) => n.statKey),
    STAT_NETWORKS.filter((n) => n.statKey !== 'solana').map((n) => n.statKey),
  )
})

test('validateUrl：RPC 允许 http/https/ws/wss，TON 配置地址只允许 http/https', () => {
  assert.equal(validateUrl(''), 'required')
  assert.equal(validateUrl('   '), 'required')
  assert.equal(validateUrl('https://api.trongrid.io'), null)
  assert.equal(validateUrl('http://127.0.0.1:8545'), null)
  assert.equal(validateUrl('wss://solana-rpc.com'), null)
  assert.equal(validateUrl('ws://localhost:8546'), null)
  assert.equal(validateUrl('ftp://node.example.com'), 'scheme')
  assert.equal(validateUrl('api.trongrid.io'), 'scheme')

  assert.equal(validateUrl('https://ton.org/global-config.json', CONFIG_URL_SCHEMES), null)
  assert.equal(validateUrl('wss://ton.org/global-config.json', CONFIG_URL_SCHEMES), 'scheme')
  assert.equal(validateUrl('http://ton.org/global-config.json', RPC_URL_SCHEMES), null)
})

test('buildRpcSaveItems：全部必填 + trim + Api Key 可空但始终保存', () => {
  const form: Record<string, string> = {}
  for (const f of RPC_FIELDS) form[f.key] = ''
  // 全空：11 个字段都报 required
  const empty = buildRpcSaveItems(form)
  assert.equal(Object.keys(empty.errors).length, 11)
  assert.equal(empty.items.length, 1) // 只有 Api Key

  // 正常填写
  form.rpc_endpoint_tron = '  https://api.trongrid.io  '
  form.rpc_endpoint_ethereum = 'https://eth.llamarpc.com'
  form.rpc_endpoint_bsc = 'https://bsc-dataseed.binance.org'
  form.rpc_endpoint_polygon = 'https://polygon-rpc.com'
  form.rpc_endpoint_arbitrum = 'https://arb1.arbitrum.io/rpc'
  form.rpc_endpoint_base = 'https://mainnet.base.org'
  form.rpc_endpoint_xlayer = 'https://rpc.xlayer.tech'
  form.rpc_endpoint_solana = 'wss://api.mainnet-beta.solana.com'
  form.rpc_endpoint_aptos = 'https://fullnode.mainnet.aptoslabs.com'
  form.rpc_endpoint_plasma = 'https://rpc.plasma.io'
  form.rpc_global_config_url_ton = 'https://ton.org/global-config.json'
  form[TRON_GRID_API_KEY] = '  key1,key2  '
  const ok = buildRpcSaveItems(form)
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.items.length, 12)
  const tron = ok.items.find((i) => i.key === 'rpc_endpoint_tron')
  assert.equal(tron?.value, 'https://api.trongrid.io')
  const apiKey = ok.items.find((i) => i.key === TRON_GRID_API_KEY)
  assert.equal(apiKey?.value, 'key1,key2')

  // 协议非法
  const bad = { ...form, rpc_endpoint_bsc: 'ftp://bsc.example.com' }
  assert.equal(buildRpcSaveItems(bad).errors.rpc_endpoint_bsc, 'scheme')
  // TON 配置地址不允许 ws
  const badTon = { ...form, rpc_global_config_url_ton: 'ws://ton.org/config' }
  assert.equal(buildRpcSaveItems(badTon).errors.rpc_global_config_url_ton, 'scheme')
})
