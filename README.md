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

### const plan = compile(str)

Compile `str` into a lazy expansion plan. The plan reports the **total number
of expansions** as a [`bigint`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt),
so even ranges larger than `Number.MAX_SAFE_INTEGER` report an exact count
without overflowing, and it can materialize a contiguous slice of expansions
on demand — without ever generating the items that come before it. Use this
when you only need a slice of a very large expansion.

```js
import { compile } from 'brace-expansion'

const plan = compile('a{1..3}{x,y}')

plan.count // 6n  (a bigint)

plan.at(3n) // 'a2y' — the 4th expansion (0-based)

plan.range(3, 2) // ['a2y', 'a3x'] — two items starting at index 3
```

`range(start, count)` returns up to `count` items starting at `start`
(0-based). It throws a `RangeError` if `start` is not in `[0, count)`.
`at(index)` returns the single expansion at `index` and throws the same
`RangeError` for an out-of-bounds index. `start`/`index` accept a `bigint`
or a `number`.

Because items are produced lazily, taking the last two items of a huge range
is instant and does not iterate the whole range:

```js
const huge = compile('{1..1000000000}')
huge.count // 1000000000n
huge.range(huge.count - 2n, 2) // ['999999999', '1000000000']
```

The plan follows the same expansion order as `expand` — nested alternatives,
Cartesian products of consecutive segments, and numeric/alphabetic ranges —
and illegal or non-expanding patterns are kept literal, exactly as in
`expand`. The ordinary `expand` interface is unchanged; `compile` is an
explicit, opt-in compilation path.

Unlike `expand`, the plan's count is **not** capped by `max`: it is the true
size of the expansion. The `max` option only applies to the eager `expand`
call.

