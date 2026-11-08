import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ATOM_KEYS,
  buildAtomConfItems,
  buildSyncConfItems,
  defaultAtomForm,
  defaultSyncForm,
  defaultSyntaxValueOnTypeChange,
  describeFormSyntax,
  describeSyntax,
  formatValue,
  generateSyntax,
  parseFloatRate,
  parseSyntax,
  secondsToMinutes,
  syncFormFromApiUrl,
  validateSyncForm,
  validateSyntax,
} from '../src/lib/rate-syntax.ts'

/* --------------------------------- parseSyntax --------------------------------- */

test('parseSyntax empty/nullish → market', () => {
  assert.deepEqual(parseSyntax(''), { type: 'market', value: undefined })
})

test('parseSyntax ratio', () => {
  assert.deepEqual(parseSyntax('~1.02'), { type: '~', value: 1.02 })
})

test('parseSyntax fixed float keeps sign', () => {
  assert.deepEqual(parseSyntax('+0.3'), { type: 'fixed', value: 0.3 })
  assert.deepEqual(parseSyntax('-0.2'), { type: 'fixed', value: -0.2 })
})

test('parseSyntax fixed value', () => {
  assert.deepEqual(parseSyntax('7.4'), { type: '', value: 7.4 })
})

test('parseSyntax garbage value → NaN', () => {
  const parsed = parseSyntax('abc')
  assert.equal(parsed.type, '')
  assert.ok(Number.isNaN(parsed.value))
})

/* -------------------------------- generateSyntax -------------------------------- */

test('generateSyntax market → empty', () => {
  assert.equal(generateSyntax('market', 1.5), '')
})

test('generateSyntax missing value → empty', () => {
  assert.equal(generateSyntax('~', undefined), '')
  assert.equal(generateSyntax('fixed', null), '')
})

test('generateSyntax fixed float', () => {
  assert.equal(generateSyntax('fixed', 0.3), '+0.3')
  assert.equal(generateSyntax('fixed', -0.2), '-0.2')
  assert.equal(generateSyntax('fixed', 0), '+0')
})

test('generateSyntax ratio', () => {
  assert.equal(generateSyntax('~', 1.02), '~1.02')
  assert.equal(generateSyntax('~', 0.97), '~0.97')
})

test('generateSyntax fixed value', () => {
  assert.equal(generateSyntax('', 7.4), '7.4')
})

test('generateSyntax trims trailing zeros to 6 decimals', () => {
  assert.equal(generateSyntax('~', 1.0200000001), '~1.02')
  assert.equal(generateSyntax('fixed', 0.3000004), '+0.3')
})

/* -------------------------------- validateSyntax -------------------------------- */

test('validateSyntax market always ok', () => {
  assert.equal(validateSyntax('market', undefined), null)
})

test('validateSyntax missing value', () => {
  assert.equal(validateSyntax('~', undefined), 'missing-value')
  assert.equal(validateSyntax('fixed', null), 'missing-value')
  assert.equal(validateSyntax('', undefined), 'missing-value')
})

test('validateSyntax ratio must be positive', () => {
  assert.equal(validateSyntax('~', 0), 'ratio-positive')
  assert.equal(validateSyntax('~', -1), 'ratio-positive')
  assert.equal(validateSyntax('~', 0.5), null)
})

test('validateSyntax fixed value cannot be negative', () => {
  assert.equal(validateSyntax('', -7), 'fixed-negative')
  assert.equal(validateSyntax('', 7), null)
  // 固定浮动允许负数
  assert.equal(validateSyntax('fixed', -0.2), null)
})

/* ---------------------------- describeSyntax / form ---------------------------- */

test('describeSyntax empty → market', () => {
  assert.deepEqual(describeSyntax(''), { mode: 'market' })
})

test('describeSyntax fixed float', () => {
  assert.deepEqual(describeSyntax('+0.3'), { mode: 'fixed-float', value: '0.3' })
  assert.deepEqual(describeSyntax('-0.2'), { mode: 'fixed-float', value: '-0.2' })
})

test('describeSyntax ratio', () => {
  assert.deepEqual(describeSyntax('~1.02'), { mode: 'ratio', value: '1.02' })
})

test('describeSyntax fixed value', () => {
  assert.deepEqual(describeSyntax('7.4'), { mode: 'fixed-value', value: '7.4' })
})

test('describeSyntax invalid → null', () => {
  assert.equal(describeSyntax('abc'), null)
})

test('describeFormSyntax without value', () => {
  assert.deepEqual(describeFormSyntax('market', undefined), { mode: 'market' })
  assert.deepEqual(describeFormSyntax('fixed', undefined), { mode: 'fixed-float' })
  assert.deepEqual(describeFormSyntax('~', undefined), { mode: 'ratio' })
  assert.deepEqual(describeFormSyntax('', undefined), { mode: 'fixed-value' })
})

test('describeFormSyntax with value', () => {
  assert.deepEqual(describeFormSyntax('fixed', -0.2), {
    mode: 'fixed-float',
    value: '-0.2',
  })
  assert.deepEqual(describeFormSyntax('~', 1), { mode: 'ratio', value: '1' })
})

/* -------------------------- defaultSyntaxValueOnTypeChange -------------------------- */

test('type change to market clears value', () => {
  assert.equal(defaultSyntaxValueOnTypeChange('market', 1.5), undefined)
})

test('type change to ratio defaults 0/undefined to 1', () => {
  assert.equal(defaultSyntaxValueOnTypeChange('~', 0), 1.0)
  assert.equal(defaultSyntaxValueOnTypeChange('~', undefined), 1.0)
  assert.equal(defaultSyntaxValueOnTypeChange('~', 0.5), 0.5)
})

test('type change away from ratio turns 1 into 0', () => {
  assert.equal(defaultSyntaxValueOnTypeChange('', 1), 0)
  assert.equal(defaultSyntaxValueOnTypeChange('fixed', 1), 0)
  assert.equal(defaultSyntaxValueOnTypeChange('', 7.4), 7.4)
})

/* ------------------------------- parseFloatRate ------------------------------- */

test('parseFloatRate empty syntax returns raw', () => {
  assert.equal(parseFloatRate('', 7.25), 7.25)
})

test('parseFloatRate plain number overrides raw', () => {
  assert.equal(parseFloatRate('7.4', 7.25), 7.4)
})

test('parseFloatRate ratio/add/sub with round(4)', () => {
  assert.equal(parseFloatRate('~1.02', 7.25), 7.395)
  assert.equal(parseFloatRate('+0.3', 7.25), 7.55)
  assert.equal(parseFloatRate('-0.2', 7.25), 7.05)
})

test('parseFloatRate rounds half up to 4 decimals like Go', () => {
  // 7.25005 * 1.02 = 7.395051 → 7.3951
  assert.equal(parseFloatRate('~1.02', 7.25005), 7.3951)
})

test('parseFloatRate invalid syntax returns 0', () => {
  assert.equal(parseFloatRate('abc', 7.25), 0)
  assert.equal(parseFloatRate('~~1', 7.25), 0)
  assert.equal(parseFloatRate('+1.2.3', 7.25), 0)
})

/* --------------------------------- sync form --------------------------------- */

test('formatValue strips trailing zeros', () => {
  assert.equal(formatValue(1.02), '1.02')
  assert.equal(formatValue(0.30000000001), '0.3')
  assert.equal(formatValue(1), '1')
})

test('secondsToMinutes rounds and defaults', () => {
  assert.equal(secondsToMinutes('3600'), 60)
  assert.equal(secondsToMinutes('3599'), 60) // round(59.98)
  assert.equal(secondsToMinutes('600'), 10)
  assert.equal(secondsToMinutes(undefined), 60)
  assert.equal(secondsToMinutes('abc'), 60)
})

test('syncFormFromApiUrl maps builtin presets', () => {
  const form = syncFormFromApiUrl(defaultSyncForm(), 'https://api.bepusdt.online/')
  assert.equal(form.apiUrlPreset, 'https://api.bepusdt.online')
  assert.equal(form.customApiUrl, '')
})

test('syncFormFromApiUrl falls back to custom', () => {
  const form = syncFormFromApiUrl(defaultSyncForm(), 'https://my.host/api/')
  assert.equal(form.apiUrlPreset, 'custom')
  assert.equal(form.customApiUrl, 'https://my.host/api')
})

test('syncFormFromApiUrl default when empty', () => {
  const form = syncFormFromApiUrl(defaultSyncForm(), undefined)
  assert.equal(form.apiUrlPreset, 'https://api.coingecko.com')
})

test('validateSyncForm catches each field', () => {
  const base = defaultSyncForm()
  assert.equal(validateSyncForm({ ...base, minutes: 9 }), 'minutes')
  assert.equal(validateSyncForm({ ...base, minutes: 1441 }), 'minutes')
  assert.equal(
    validateSyncForm({ ...base, apiUrlPreset: 'custom', customApiUrl: '' }),
    'api-url-empty',
  )
  assert.equal(
    validateSyncForm({ ...base, apiUrlPreset: 'custom', customApiUrl: 'ftp://x' }),
    'api-url-invalid',
  )
  assert.equal(validateSyncForm({ ...base, historyDays: 0 }), 'history-days')
  assert.equal(validateSyncForm({ ...base, historyDays: 366 }), 'history-days')
  assert.equal(validateSyncForm(base), null)
  // 自建合法 URL
  assert.equal(
    validateSyncForm({ ...base, apiUrlPreset: 'custom', customApiUrl: 'http://my.host' }),
    null,
  )
})

test('buildSyncConfItems converts minutes to seconds', () => {
  const items = buildSyncConfItems({ ...defaultSyncForm(), minutes: 90 })
  assert.deepEqual(items, [
    { key: 'rate_sync_interval', value: '5400' },
    { key: 'rate_sync_coingecko_api_url', value: 'https://api.coingecko.com' },
    { key: 'rate_sync_coingecko_api_key', value: '' },
    { key: 'rate_sync_history_days', value: '30' },
  ])
})

/* --------------------------------- atom form --------------------------------- */

test('defaultAtomForm has legacy defaults', () => {
  assert.deepEqual(defaultAtomForm(), {
    usdt: 0.01,
    usdc: 0.01,
    trx: 0.01,
    eth: 0.000001,
    bnb: 0.00001,
    gram: 0.01,
  })
})

test('buildAtomConfItems emits all six keys', () => {
  const items = buildAtomConfItems(defaultAtomForm())
  assert.equal(items.length, 6)
  assert.deepEqual(items.map((i) => i.key), [...ATOM_KEYS])
  assert.deepEqual(items[0], { key: 'atom_usdt', value: '0.01' })
  assert.deepEqual(items[4], { key: 'atom_bnb', value: '0.00001' })
})
