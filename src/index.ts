import { balanced } from 'balanced-match'

const escSlash = '\0SLASH' + Math.random() + '\0'
const escOpen = '\0OPEN' + Math.random() + '\0'
const escClose = '\0CLOSE' + Math.random() + '\0'
const escComma = '\0COMMA' + Math.random() + '\0'
const escPeriod = '\0PERIOD' + Math.random() + '\0'
const escSlashPattern = new RegExp(escSlash, 'g')
const escOpenPattern = new RegExp(escOpen, 'g')
const escClosePattern = new RegExp(escClose, 'g')
const escCommaPattern = new RegExp(escComma, 'g')
const escPeriodPattern = new RegExp(escPeriod, 'g')
const slashPattern = /\\\\/g
const openPattern = /\\{/g
const closePattern = /\\}/g
const commaPattern = /\\,/g
const periodPattern = /\\\./g

export const EXPANSION_MAX = 100_000

function numeric(str: string) {
  return !isNaN(str as any) ? parseInt(str, 10) : str.charCodeAt(0)
}

function escapeBraces(str: string) {
  return str
    .replace(slashPattern, escSlash)
    .replace(openPattern, escOpen)
    .replace(closePattern, escClose)
    .replace(commaPattern, escComma)
    .replace(periodPattern, escPeriod)
}

function unescapeBraces(str: string) {
  return str
    .replace(escSlashPattern, '\\')
    .replace(escOpenPattern, '{')
    .replace(escClosePattern, '}')
    .replace(escCommaPattern, ',')
    .replace(escPeriodPattern, '.')
}

/**
 * Basically just str.split(","), but handling cases
 * where we have nested braced sections, which should be
 * treated as individual members, like {a,{b,c},d}
 */
function parseCommaParts(str: string) {
  if (!str) {
    return ['']
  }

  const parts: string[] = []
  const m = balanced('{', '}', str)

  if (!m) {
    return str.split(',')
  }

  const { pre, body, post } = m
  const p = pre.split(',')

  p[p.length - 1] += '{' + body + '}'
  const postParts = parseCommaParts(post)
  if (post.length) {
    ;(p[p.length - 1] as string) += postParts.shift()
    p.push.apply(p, postParts)
  }

  parts.push.apply(parts, p)

  return parts
}

export type BraceExpansionOptions = {
  max?: number
}

export function expand(str: string, options: BraceExpansionOptions = {}) {
  if (!str) {
    return []
  }

  const { max = EXPANSION_MAX } = options

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.slice(0, 2) === '{}') {
    str = '\\{\\}' + str.slice(2)
  }

  return expand_(escapeBraces(str), max, true).map(unescapeBraces)
}

function embrace(str: string) {
  return '{' + str + '}'
}

function isPadded(el: string) {
  return /^-?0\d/.test(el)
}

function lte(i: number, y: number) {
  return i <= y
}

function gte(i: number, y: number) {
  return i >= y
}

function expand_(str: string, max: number, isTop: boolean): string[] {
  /** @type {string[]} */
  const expansions: string[] = []

  const m = balanced('{', '}', str)
  if (!m) return [str]

  // no need to expand pre, since it is guaranteed to be free of brace-sets
  const pre = m.pre
  const post: string[] = m.post.length ? expand_(m.post, max, false) : ['']

  if (/\$$/.test(m.pre)) {
    for (let k = 0; k < post.length && k < max; k++) {
      const expansion = pre + '{' + m.body + '}' + post[k]
      expansions.push(expansion)
    }
  } else {
    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body)
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(
      m.body,
    )
    const isSequence = isNumericSequence || isAlphaSequence
    const isOptions = m.body.indexOf(',') >= 0
    if (!isSequence && !isOptions) {
      // {a},b}
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + '{' + m.body + escClose + m.post
        return expand_(str, max, true)
      }
      return [str]
    }

    let n: string[]
    if (isSequence) {
      n = m.body.split(/\.\./)
    } else {
      n = parseCommaParts(m.body)
      if (n.length === 1 && n[0] !== undefined) {
        // x{{a,b}}y ==> x{a}y x{b}y
        n = expand_(n[0], max, false).map(embrace)
        //XXX is this necessary? Can't seem to hit it in tests.
        /* c8 ignore start */
        if (n.length === 1) {
          return post.map(p => m.pre + n[0] + p)
        }
        /* c8 ignore stop */
      }
    }

    // at this point, n is the parts, and we know it's not a comma set
    // with a single entry.
    let N: string[]

    if (isSequence && n[0] !== undefined && n[1] !== undefined) {
      const x = numeric(n[0])
      const y = numeric(n[1])
      const width = Math.max(n[0].length, n[1].length)
      let incr =
        n.length === 3 && n[2] !== undefined ?
          Math.max(Math.abs(numeric(n[2])), 1)
        : 1
      let test = lte
      const reverse = y < x
      if (reverse) {
        incr *= -1
        test = gte
      }
      const pad = n.some(isPadded)

      N = []

      for (let i = x; test(i, y) && N.length < max; i += incr) {
        let c
        if (isAlphaSequence) {
          c = String.fromCharCode(i)
          if (c === '\\') {
            c = ''
          }
        } else {
          c = String(i)
          if (pad) {
            const need = width - c.length
            if (need > 0) {
              const z = new Array(need + 1).join('0')
              if (i < 0) {
                c = '-' + z + c.slice(1)
              } else {
                c = z + c
              }
            }
          }
        }
        N.push(c)
      }
    } else {
      N = []

      for (let j = 0; j < n.length; j++) {
        N.push.apply(N, expand_(n[j] as string, max, false))
      }
    }

    for (let j = 0; j < N.length; j++) {
      for (let k = 0; k < post.length && expansions.length < max; k++) {
        const expansion = pre + N[j] + post[k]
        if (!isTop || isSequence || expansion) {
          expansions.push(expansion)
        }
      }
    }
  }

  return expansions
}

/**
 * A lazy, compiled brace-expansion plan.
 *
 * The plan is built once from a pattern and can then answer the total number
 * of expansions (as a {@link bigint}, so huge ranges never overflow) and
 * materialize a contiguous slice of expansions on demand, without ever
 * generating the items that come before it.
 */
export type ExpansionPlan = {
  /**
   * The total number of expansions this plan produces.
   *
   * Unlike {@link expand}, this is not capped by `max`; it is the true size
   * of the expansion. It is a {@link bigint} so that ranges larger than
   * `Number.MAX_SAFE_INTEGER` (e.g. `{1..1000000000}`) report an exact count.
   */
  readonly count: bigint

  /**
   * Return the expansion at the given 0-based `index`.
   *
   * @throws {@link RangeError} if `index` is not in `[0, count)`.
   */
  at(index: bigint | number): string

  /**
   * Materialize `count` expansions starting at `start` (0-based).
   *
   * The slice is produced lazily: only the requested items are generated, so
   * taking the last two items of `{1..1000000000}` does not iterate the whole
   * range.
   *
   * @returns up to `count` items (fewer if `start + count` runs past the end).
   * @throws {@link RangeError} if `start` is not in `[0, count)`.
   */
  range(start: bigint | number, count: number): string[]
}

/**
 * A single indexable segment of a plan. Concatenating segments forms the full
 * expansion; the total size is the product of segment sizes (Cartesian
 * product), and items are addressed by mixed-radix decomposition.
 */
type Idx = {
  size: bigint
  /** Number of indices whose expansion is the empty string. */
  emptyCount: bigint
  at(i: bigint): string
}

type Plan = {
  segs: Idx[]
  /** Apply the top-level empty-expansion filter (mirrors `expand_`). */
  filterEmpty: boolean
}

function litIdx(value: string): Idx {
  return {
    size: 1n,
    emptyCount: value === '' ? 1n : 0n,
    at: () => value,
  }
}

function seqIdx(body: string): Idx | null {
  const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(body)
  const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(body)
  if (!isNumericSequence && !isAlphaSequence) return null

  const n = body.split(/\.\./)
  const x = numeric(n[0] as string)
  const y = numeric(n[1] as string)
  const width = Math.max(n[0]?.length ?? 0, n[1]?.length ?? 0)
  const incr =
    n.length === 3 ? Math.max(Math.abs(numeric(n[2] as string)), 1) : 1
  const reverse = y < x
  const incrB = BigInt(incr)
  const xB = BigInt(x)
  const yB = BigInt(y)

  // Compute the number of elements without iterating, so huge ranges are cheap.
  let size: bigint
  if (reverse) {
    size = xB >= yB ? (xB - yB) / incrB + 1n : 0n
  } else {
    size = yB >= xB ? (yB - xB) / incrB + 1n : 0n
  }

  const pad = n.some(isPadded)

  const at = (i: bigint): string => {
    let v: number
    if (reverse) v = x - Number(i) * incr
    else v = x + Number(i) * incr

    let c: string
    if (isAlphaSequence) {
      c = String.fromCharCode(v)
      // Bash drops the literal backslash produced by some alpha ranges.
      if (c === '\\') c = ''
    } else {
      c = String(v)
      if (pad) {
        const need = width - c.length
        if (need > 0) {
          const z = new Array(need + 1).join('0')
          if (v < 0) c = '-' + z + c.slice(1)
          else c = z + c
        }
      }
    }
    return c
  }

  // Only alpha ranges can produce empty elements (the backslash case), and
  // alpha ranges are small, so iterating here is cheap.
  let emptyCount = 0n
  if (isAlphaSequence) {
    for (let i = 0n; i < size; i++) {
      if (at(i) === '') emptyCount++
    }
  }

  return { size, emptyCount, at }
}

function altIdx(choices: Plan[]): Idx {
  const sizes = choices.map(planSize)
  let total = 0n
  for (const s of sizes) total += s
  let emptyCount = 0n
  for (const c of choices) emptyCount += planEmptyCount(c)

  return {
    size: total,
    emptyCount,
    at(i: bigint): string {
      let acc = 0n
      for (let j = 0; j < choices.length; j++) {
        const s = sizes[j] as bigint
        if (i < acc + s) {
          return planAt(choices[j] as Plan, i - acc)
        }
        acc += s
      }
      throw new RangeError('brace expansion index out of bounds')
    },
  }
}

function planSize(p: Plan): bigint {
  let product = 1n
  for (const s of p.segs) product *= s.size
  return product
}

function planEmptyCount(p: Plan): bigint {
  let product = 1n
  for (const s of p.segs) product *= s.emptyCount
  return product
}

function planCount(p: Plan): bigint {
  const total = planSize(p)
  const empties = planEmptyCount(p)
  return total - (p.filterEmpty ? empties : 0n)
}

/** Mixed-radix concatenation of every segment (the raw, unfiltered item). */
function rawAt(p: Plan, i: bigint): string {
  let result = ''
  let remaining = i
  for (let k = p.segs.length - 1; k >= 0; k--) {
    const s = p.segs[k] as Idx
    const digit = remaining % s.size
    remaining /= s.size
    result = s.at(digit) + result
  }
  return result
}

/** The `i`-th expansion, applying the top-level empty filter when needed. */
function planAt(p: Plan, i: bigint): string {
  if (!p.filterEmpty) return rawAt(p, i)
  const empties = planEmptyCount(p)
  if (empties === 0n) return rawAt(p, i)

  // Empty expansions exist; they are rare and only occur for small ranges, so
  // walk the raw items and skip the empty ones.
  if (i < 0n || i >= planCount(p)) {
    throw new RangeError('brace expansion index out of bounds')
  }
  let seen = 0n
  let idx = 0n
  for (;;) {
    const v = rawAt(p, idx)
    if (v !== '') {
      if (seen === i) return v
      seen++
    }
    idx++
  }
}

function buildPlan(str: string, top: boolean): Plan {
  const m = balanced('{', '}', str)
  if (!m) return { segs: [litIdx(str)], filterEmpty: false }

  const pre = m.pre
  const postSegs =
    m.post.length ? buildPlan(m.post, false).segs : [litIdx('')]

  // Anything starting with `${` is not eligible for brace expansion.
  if (/\$$/.test(pre)) {
    return {
      segs: [litIdx(pre + '{' + m.body + '}'), ...postSegs],
      filterEmpty: false,
    }
  }

  const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body)
  const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(
    m.body,
  )
  const isSequence = isNumericSequence || isAlphaSequence
  const isOptions = m.body.indexOf(',') >= 0

  if (!isSequence && !isOptions) {
    // {a},b} — treat the first close brace as literal and re-expand.
    if (m.post.match(/,(?!,).*\}/)) {
      const newStr = pre + '{' + m.body + escClose + m.post
      return buildPlan(newStr, true)
    }
    return { segs: [litIdx(str)], filterEmpty: false }
  }

  let bodySeg: Idx
  if (isSequence) {
    bodySeg = seqIdx(m.body) as Idx
  } else {
    const n = parseCommaParts(m.body)
    if (n.length === 1 && n[0] !== undefined) {
      // x{{a,b}}y ==> x{a}y x{b}y
      const inner = buildPlan(n[0], false)
      const innerSize = planSize(inner)
      bodySeg = {
        size: innerSize,
        emptyCount: 0n,
        at(i: bigint) {
          return '{' + rawAt(inner, i) + '}'
        },
      }
    } else {
      const choices = n.map(part => buildPlan(part, false))
      bodySeg = altIdx(choices)
    }
  }

  const filterEmpty = top && isOptions && !isSequence
  return { segs: [litIdx(pre), bodySeg, ...postSegs], filterEmpty }
}

/**
 * Compile `str` into a lazy {@link ExpansionPlan}.
 *
 * The plan reports the exact total number of expansions as a {@link bigint}
 * and can materialize any contiguous slice on demand, without generating the
 * items that precede it. The ordinary {@link expand} interface is unchanged;
 * this is an explicit, opt-in compilation path.
 *
 * Illegal or non-expanding patterns are kept literal, exactly as in
 * {@link expand}.
 *
 * @example
 * ```js
 * const plan = compile('a{1..3}{x,y}')
 * plan.count // 6n
 * plan.range(3, 2) // ['a2y', 'a3x']
 * ```
 */
export function compile(str: string): ExpansionPlan {
  if (!str) {
    return {
      count: 0n,
      at() {
        throw new RangeError('brace expansion index out of bounds')
      },
      range() {
        throw new RangeError('brace expansion index out of bounds')
      },
    }
  }

  // Match the leading-`{}` quirk handled in `expand`.
  if (str.slice(0, 2) === '{}') {
    str = '\\{\\}' + str.slice(2)
  }

  const plan = buildPlan(escapeBraces(str), true)

  return {
    get count() {
      return planCount(plan)
    },
    at(index: bigint | number): string {
      const i = typeof index === 'number' ? BigInt(index) : index
      if (i < 0n || i >= planCount(plan)) {
        throw new RangeError('brace expansion index out of bounds')
      }
      return unescapeBraces(planAt(plan, i))
    },
    range(start: bigint | number, count: number): string[] {
      const s = typeof start === 'number' ? BigInt(start) : start
      const total = planCount(plan)
      if (s < 0n || s >= total) {
        throw new RangeError('brace expansion start index out of bounds')
      }
      const n = Math.max(0, Math.min(count, Number(total - s)))
      const result: string[] = []
      for (let k = 0; k < n; k++) {
        result.push(unescapeBraces(planAt(plan, s + BigInt(k))))
      }
      return result
    },
  }
}
