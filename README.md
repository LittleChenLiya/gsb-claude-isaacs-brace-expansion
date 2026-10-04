# brace-expansion

[Brace expansion](https://www.gnu.org/software/bash/manual/html_node/Brace-Expansion.html),
as known from sh/bash, in JavaScript.

[![CI](https://github.com/juliangruber/brace-expansion/actions/workflows/ci.yml/badge.svg)](https://github.com/juliangruber/brace-expansion/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/brace-expansion.svg)](https://www.npmjs.org/package/brace-expansion)

## Example

```js
import { expand } from 'brace-expansion'

expand('file-{a,b,c}.jpg')
// => ['file-a.jpg', 'file-b.jpg', 'file-c.jpg']

expand('-v{,,}')
// => ['-v', '-v', '-v']

expand('file{0..2}.jpg')
// => ['file0.jpg', 'file1.jpg', 'file2.jpg']

expand('file-{a..c}.jpg')
// => ['file-a.jpg', 'file-b.jpg', 'file-c.jpg']

expand('file{2..0}.jpg')
// => ['file2.jpg', 'file1.jpg', 'file0.jpg']

expand('file{0..4..2}.jpg')
// => ['file0.jpg', 'file2.jpg', 'file4.jpg']

expand('file-{a..e..2}.jpg')
// => ['file-a.jpg', 'file-c.jpg', 'file-e.jpg']

expand('file{00..10..5}.jpg')
// => ['file00.jpg', 'file05.jpg', 'file10.jpg']

expand('{{A..C},{a..c}}')
// => ['A', 'B', 'C', 'a', 'b', 'c']

expand('ppp{,config,oe{,conf}}')
// => ['ppp', 'pppconfig', 'pppoe', 'pppoeconf']
```

## API

```js
import { expand } from 'brace-expansion'
```

### const expanded = expand(str, [options])

Return an array of all possible and valid expansions of `str`. If
none are found, `[str]` is returned.

The `options` object can provide a `max` value to cap the number
of expansions allowed. This is limited to `100_000` by default,
to prevent DoS attacks.

```js
const expansions = expand('{1..100}'.repeat(5), {
  max: 100,
})
// expansions.length will be 100, not 100^5
```

Valid expansions are:

```js
;/^(.*,)+(.+)?$/
// {a,b,...}
```

A comma separated list of options, like `{a,b}` or `{a,{b,c}}` or `{,a,}`.

```js
;/^-?\d+\.\.-?\d+(\.\.-?\d+)?$/
// {x..y[..incr]}
```

A numeric sequence from `x` to `y` inclusive, with optional increment.
If `x` or `y` start with a leading `0`, all the numbers will be padded
to have equal length. Negative numbers and backwards iteration work too.

```js
;/^-?\d+\.\.-?\d+(\.\.-?\d+)?$/
// {x..y[..incr]}
```

An alphabetic sequence from `x` to `y` inclusive, with optional increment.
`x` and `y` must be exactly one character, and if given, `incr` must be a
number.

For compatibility reasons, the string `${` is not eligible for brace expansion.

## Lazy expansion plans

When an expansion is too large to build eagerly, or when only a few
expansions are needed, compile the pattern into an `ExpansionPlan` instead.

```js
import { compile, expansionCount } from 'brace-expansion'

const plan = compile('a{1..3}{x,y}')
plan.total // 6n
plan.take(3n, 2n) // ['a2y', 'a3x']
```

A plan uses exactly the same expansion rules and ordering as `expand`
(nested option sets, Cartesian products, numeric/alphabetic sequences,
steps, zero padding and escaped commas/braces). Patterns that do not form
an expansion are still returned literally (`total === 1n`), and the empty
string yields `0n`. Plans are not capped by the `expand` `max` option.

### const plan = compile(str)

Returns an `ExpansionPlan`. Compiling never enumerates expansions; the
members of a sequence are reached by arithmetic, so compiling
`{1..1000000000000}` or reading only its last two items does not walk the
range.

### plan.total

Total number of expansions as a `bigint`, so counts above
`Number.MAX_SAFE_INTEGER` stay exact.

### expansionCount(str)

Convenience accessor equal to `compile(str).total`.

### const item = plan.at(index)

Return the expansion at the zero-based `index`, which may be a `bigint` or
a safe-integer `number`. Throws `RangeError` if `index` is not a safe
integer/bigint or is outside `[0, total)`.

### const items = plan.take(start, count?)

Return up to `count` expansions beginning at the zero-based ordinal
`start` (a `bigint` or safe-integer `number`). The result is clipped to
`total`, so `start >= total` returns `[]` and a trailing window shorter
than `count` is returned as-is. Omitting `count` returns all remaining
expansions. Negative or non-integral arguments throw `RangeError`; a
request larger than the maximum JavaScript array length also throws, in
which case read a smaller window.

```js
const huge = compile('x{1..1000000000000}y')
huge.total // 1000000000000n
huge.take(999999999998n, 2n) // ['x999999999999y', 'x1000000000000y']
```
