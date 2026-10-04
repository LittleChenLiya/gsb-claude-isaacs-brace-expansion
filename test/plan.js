import t from 'tap'
import { expand, compile } from '../dist/esm/index.js'

// Patterns that must expand to the same items as `expand`, in the same order.
const orderCases = [
  'a{1..3}{x,y}',
  '{1..3}',
  '{3..1}',
  '{10..0..2}',
  '{10..0..-2}',
  '{-50..-0..5}',
  '{z..a..-2}',
  '{Z..a}',
  '{a..Z}',
  '{1..2..0}',
  '{0..0}',
  '{5..1..2}',
  '{1..5..2}',
  '{-10..00}',
  '{0001..-5..2}',
  '{0001..-5..-2}',
  '{0001..5..-2}',
  '{,}',
  'a{,}b',
  '{,}{,}',
  'a{,}',
  '{,}b',
  '{}',
  'a{}b',
  '{a,b}{,}',
  '{,}{a,b}',
  '{a,,b}',
  '{,a,}',
  'a{,}b{,}c',
  '{a,b,c}',
  'a{b,c{d,e},{f,g}h}x{y,z}',
  '{x,y{,}g}',
  '{{a,b},c}',
  '{{a,b}c}',
  '{{a,b},}',
  'X{{a,b},}X',
  '{{a,b},}c',
  '{{a,b}.}',
  '{{a,b}}',
  'X{a..#}X',
  '{a,b\}c,d}',
  'a,\{b,c}',
  '{a,\{a,b}c}',
  '{-10.\.00}',
  'ff{c,b,a}',
  'f{d,e,f}g',
  '{l,n,m}xyz',
  '{abc\,def}',
  '{abc}',
  '{x\,y,\{abc\},trie}',
  '{',
  '}',
  'abcd{efgh',
  '{1..10}',
  '{{0..10},braces}',
  'x{{0..10},braces}y',
  '{3..3}',
  'x{3..3}y',
  '{10..1}',
  '{10..1}y',
  'x{10..1}y',
  '{a..f}',
  '{f..a}',
  '{a..A}',
  '{A..a}',
  '{f..f}',
  '{1..f}',
  '{f..1}',
  '{-1..-10}',
  '{-20..0}',
  'a-{b{d,e}}-c',
  'a-{bdef-{g,i}-c',
  '{klklkl}{1,2,3}',
  '{1..10..2}',
  '{-1..-10..2}',
  '{-1..-10..-2}',
  '{10..1..-2}',
  '{10..1..2}',
  '{1..20..2}',
  '{1..20..20}',
  '{100..0..5}',
  '{100..0..-5}',
  '{a..z}',
  '{a..z..2}',
  '{z..a..-2}',
  '{2147483645..2147483649}',
  '{1..10.f}',
  '{1..ff}',
  '{1..10..ff}',
  '{1.20..2}',
  '{1..20..f2}',
  '{1..20..2f}',
  '{1..2f..2}',
  '{1..ff..2}',
  '{1..f}',
  '{1..0f}',
  '{1..10f}',
  '{1..10.f}',
  '{},b}.h',
  'y{},a}x',
  '{}{},a}b',
  '{{},a}}b',
  '{}{{},a}}b',
  '{}a,b}c',
  'src/{[ui],abc}/*.ts',
  '{1..2..0}',
  '${1..3}',
  '${a,b}${c,d}',
  '${a,b}${c,d}{e,f}',
  '{a,b}${c,d}${e,f}',
  '${a,b}${c,d}{1..3}',
  'x${a,b}x${c,d}x',
  '-v{,,,,}',
  '{4..0..2}',
  '{4..0..-2}',
  '{e..a..2}',
  '{a,b{1..3},c}',
  '{{A..Z},{a..z}}',
  'ppp{,config,oe{,conf}}',
  'a{d,c,b}e',
  '{9..11}',
  '{09..11}',
  'a{1..2}b{2..3}c',
  '{1..2}{2..3}',
  '{0..8..2}',
  '{1..8..2}',
  '{3..-2}',
  '1{a..b}2{b..c}3',
  '{a..b}{b..c}',
  '{a..k..2}',
  '{b..k..2}',
  '{a},b}',
  '{a{,b}',
  '{x,y{,}g}',
  '{{a,b}',
  '{{a,b},c}',
  '{{a,b}c}',
  '{{a,b},}',
  'X{{a,b},}X',
  '{{a,b},}c',
  '{{a,b}.}',
  '{{a,b}}',
  'X{a..#}X',
  '',
]

t.test('count and order match expand', async t => {
  for (const pattern of orderCases) {
    const plan = compile(pattern)
    const expected = expand(pattern)
    t.equal(
      plan.count,
      BigInt(expected.length),
      `count ${JSON.stringify(pattern)}`,
    )
    for (let i = 0; i < expected.length; i++) {
      t.equal(
        plan.at(BigInt(i)),
        expected[i],
        `at ${JSON.stringify(pattern)}[${i}]`,
      )
    }
  }
})

t.test('range matches expand slice', async t => {
  const pattern = 'a{1..3}{x,y}'
  const plan = compile(pattern)
  const expected = expand(pattern)
  t.equal(plan.count, 6n)
  t.strictSame(plan.range(3, 2), expected.slice(3, 5))
  t.strictSame(plan.range(0, 6), expected)
  t.strictSame(plan.range(2, 3), expected.slice(2, 5))
  t.strictSame(plan.range(0, 0), [])
  // range caps at the available end
  t.strictSame(plan.range(4, 5), expected.slice(4))
})

t.test('nested alternatives', async t => {
  const plan = compile('{a,b{1..3},c}')
  t.equal(plan.count, 5n)
  t.strictSame(plan.range(0, 5), ['a', 'b1', 'b2', 'b3', 'c'])
})

t.test('escaped commas and braces keep literal semantics', async t => {
  t.strictSame(compile('{abc\,def}').range(0, 2), ['abc', 'def'])
  t.strictSame(compile('{x\,y,\{abc\},trie}').range(0, 4), [
    'x',
    'y',
    '{abc}',
    'trie',
  ])
})

t.test('zero padding in negative step direction', async t => {
  t.strictSame(compile('{0001..-5..-2}').range(0, 4), [
    '0001',
    '-001',
    '-003',
    '-005',
  ])
  t.strictSame(compile('{-10..00}').range(0, 11), [
    '-10',
    '-09',
    '-08',
    '-07',
    '-06',
    '-05',
    '-04',
    '-03',
    '-02',
    '-01',
    '000',
  ])
})

t.test('huge numeric range: last items without iterating', async t => {
  const plan = compile('{1..1000000000}')
  t.equal(plan.count, 1000000000n)
  const start = performance.now()
  t.strictSame(plan.range(plan.count - 2n, 2), ['999999999', '1000000000'])
  t.strictSame(plan.at(plan.count - 1n), '1000000000')
  t.strictSame(plan.at(0n), '1')
  const elapsed = performance.now() - start
  t.ok(elapsed < 100, `lazy access was fast (${elapsed}ms)`)
})

t.test('huge product count uses BigInt', async t => {
  const plan = compile('{1..1000000}'.repeat(6))
  t.equal(plan.count, 1000000n ** 6n)
  t.strictSame(
    plan.at(plan.count - 1n),
    '1000000'.repeat(6),
    'last item is the cartesian product of last elements',
  )
})

t.test('index boundary throws', async t => {
  const plan = compile('a{1..3}{x,y}')
  t.throws(() => plan.at(-1n), RangeError)
  t.throws(() => plan.at(6n), RangeError)
  t.throws(() => plan.range(-1n, 1), RangeError)
  t.throws(() => plan.range(6n, 1), RangeError)
})

t.test('empty pattern has zero expansions', async t => {
  const plan = compile('')
  t.equal(plan.count, 0n)
  t.throws(() => plan.at(0n), RangeError)
  t.throws(() => plan.range(0n, 1), RangeError)
})

t.test('illegal patterns stay literal', async t => {
  t.strictSame(compile('{a..9}').range(0, 1), ['{a..9}'])
  t.strictSame(compile('{1..f}').range(0, 1), ['{1..f}'])
  t.strictSame(compile('${1..3}').range(0, 1), ['${1..3}'])
})
