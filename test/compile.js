import t from 'tap'
import { expand, compile, expansionCount } from '../dist/esm/index.js'

t.test('acceptance: plan total and lazy slice', async t => {
  const plan = compile('a{1..3}{x,y}')
  t.equal(plan.total, 6n, 'total is a bigint')
  t.equal(expansionCount('a{1..3}{x,y}'), 6n)
  t.strictSame(plan.take(3n, 2n), ['a2y', 'a3x'])
  t.strictSame(
    plan.take(3n, 2n),
    expand('a{1..3}{x,y}').slice(3, 5),
    'matches an expand() slice',
  )
  t.equal(plan.at(0n), 'a1x')
  t.strictSame(plan.take(0n), ['a1x', 'a1y', 'a2x', 'a2y', 'a3x', 'a3y'])
})

t.test('huge numeric ranges are lazy', async t => {
  const n = 1_000_000_000_000n
  const start = performance.now()
  const plan = compile('x{1..1000000000000}y')
  const compiled = performance.now()
  t.equal(plan.total, n, 'count without iterating')
  t.strictSame(plan.take(n - 2n, 2n), [
    'x999999999999y',
    'x1000000000000y',
  ])
  const end = performance.now()
  t.ok(
    compiled - start < 100,
    `compile took ${compiled - start}ms without walking the range`,
  )
  t.ok(end - start < 100, `last-two read took ${end - start}ms`)

  // ranges above MAX_SAFE_INTEGER keep exact arithmetic via bigint
  const huge = compile('{1..10000000000000000}')
  t.ok(huge.total > BigInt(Number.MAX_SAFE_INTEGER))
  t.equal(huge.at(9_999_999_999_999_999n), '10000000000000000')

  // a giant Cartesian factor next to an empty option stays lazy and the
  // last items resolve without enumerating
  const cross = compile('v{1..1000000000000}{,}')
  t.equal(cross.total, 2_000_000_000_000n)
  t.strictSame(cross.take(2n * n - 3n, 3n), [
    'v999999999999',
    'v1000000000000',
    'v1000000000000',
  ])
})

t.test('reverse ranges, steps and zero padding', async t => {
  t.equal(expansionCount('{10..08}'), 3n)
  t.strictSame(compile('{10..08}').take(0n), ['10', '09', '08'])
  t.strictSame(compile('{-1..-09..2}').take(0n), [
    '-01',
    '-03',
    '-05',
    '-07',
    '-09',
  ])
  // padding detected on a negative step keeps the original semantics
  t.strictSame(compile('{-1..-09..-02}').take(0n), [
    '-01',
    '-03',
    '-05',
    '-07',
    '-09',
  ])
  t.strictSame(compile('{1..9..02}').take(0n), ['1', '3', '5', '7', '9'])
  t.strictSame(compile('{4..0..-2}').take(0n), ['4', '2', '0'])
  t.strictSame(
    compile('{-001..002}').take(0n),
    expand('{-001..002}'),
    'padded negative start keeps width of the wider endpoint',
  )
  t.strictSame(
    compile('{120..-5..3}{x,}').take(0n),
    expand('{120..-5..3}{x,}'),
  )
})

t.test('nested options and cartesian order', async t => {
  const cases = [
    '{a,b{1..3},c}',
    '{{A..Z},{a..z}}',
    'ppp{,config,oe{,conf}}',
    '{1..3}{x,y}{A..B}',
    '{a,b}{{a,b},a,b}',
    'a{b,c{d,e},{f,g}h}x{y,z}',
    'x{{a,b}}y',
    '-v{,,,,}',
  ]
  for (const s of cases) {
    const plan = compile(s)
    const expected = expand(s)
    t.equal(plan.total, BigInt(expected.length), s)
    t.strictSame(plan.take(0n), expected, s)
  }
})

t.test('escaped commas and braces', async t => {
  const cases = [
    'a{b\,c,d}e',
    'a\{b,c\}d',
    '\{a,b}{{a,b},a,b}',
    'q{\,,}',
    'r{,\,}',
    'a{b,c\}d,e}',
  ]
  for (const s of cases) {
    t.strictSame(compile(s).take(0n), expand(s), s)
    t.equal(compile(s).total, BigInt(expand(s).length), s)
  }
})

t.test('literal and non-expanding patterns', async t => {
  for (const s of ['', '{a}', '{a..9}', 'plain', '{a},b}']) {
    const plan = compile(s)
    const expected = expand(s)
    t.equal(plan.total, BigInt(expected.length), JSON.stringify(s))
    t.strictSame(plan.take(0n), expected, JSON.stringify(s))
  }
  t.equal(compile('').total, 0n)
  t.strictSame(compile('just text').take(0n), ['just text'])
  t.strictSame(compile('${1..3}').take(0n), ['${1..3}'])
})

t.test('alphabetic empty member over backslash', async t => {
  t.strictSame(compile('{Y..b}').take(0n), expand('{Y..b}'))
  t.strictSame(compile('{Y..b}{1..3}').take(0n), expand('{Y..b}{1..3}'))
})

t.test('ordinal boundaries', async t => {
  const plan = compile('{a,b,c}')
  t.equal(plan.at(2), 'c')
  t.equal(plan.at(2n), 'c')
  t.strictSame(plan.take(1n), ['b', 'c'])
  t.strictSame(plan.take(1n, 1n), ['b'])
  t.strictSame(plan.take(3n), [], 'start at total is empty')
  t.strictSame(plan.take(10n, 2n), [], 'start past total is empty')
  t.strictSame(plan.take(2n, 100n), ['c'], 'count clipped to remainder')
  t.strictSame(plan.take(0n, 0n), [], 'zero count')

  t.throws(() => plan.at(3n), RangeError)
  t.throws(() => plan.at(-1n), RangeError)
  t.throws(() => plan.take(-1n), RangeError)
  t.throws(() => plan.take(0n, -1n), RangeError)
  t.throws(() => plan.at(1.5), RangeError)
  t.throws(() => plan.at(NaN), RangeError)
})

t.test('total API', async t => {
  t.equal(expansionCount('{1..3}{x,y}'), 6n)
  t.equal(expansionCount('no braces'), 1n)
  t.equal(expansionCount(''), 0n)
  t.equal(expansionCount('{1..100}{1..100}{1..100}'), 1_000_000n)
})
