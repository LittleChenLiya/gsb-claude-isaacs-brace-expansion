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
 * An explicit, lazily readable expansion plan.
 *
 * A plan is produced by {@link compile}. It knows the total number of
 * expansions as a `bigint` and can render any slice of that expansion by
 * ordinal, so that reading the ten-billionth item never materialises the
 * expansions preceding it.
 */
export type ExpansionPlan = {
  /**
   * Total number of expansions, as a `bigint` so that counts beyond
   * `Number.MAX_SAFE_INTEGER` do not overflow.
   */
  total: bigint
  /**
   * Return the expansion at the zero-based ordinal `index`.
   *
   * `index` may be a non-negative `bigint`, or a non-negative safe integer
   * `number`, and must be strictly smaller than `total`. Out of range or
   * non-integral indices throw a `RangeError`.
   */
  at(index: number | bigint): string
  /**
   * Return up to `count` expansions starting at the zero-based ordinal
   * `start`.
   *
   * A negative `start`/`count`, a non-integral argument, or a `count`
   * larger than the maximum array length throws a `RangeError`. The result
   * is clipped at `total`, so starting at or past the end yields an empty
   * array. When `count` is omitted every remaining expansion is returned.
   */
  take(start: number | bigint, count?: number | bigint): string[]
}

/**
 * Compile `str` into an {@link ExpansionPlan}.
 *
 * The plan has exactly the same semantics as {@link expand}: nested option
 * sets, Cartesian products of consecutive brace sections, numeric and
 * alphabetic sequences, stepping, zero padding and escaped commas/braces
 * all produce the same strings in the same order. Patterns that are
 * illegal or do not form an expansion are treated literally just like in
 * `expand` (the resulting plan has `total === 1n`), and the empty string
 * yields `0n` expansions.
 *
 * Unlike `expand`, a plan has no `max` cap and performs no eager
 * generation: only the items actually read are rendered, and sequence
 * members are reached by arithmetic, so compiling `{1..1000000000000}` or
 * reading only its last two items never iterates the range.
 */
export function compile(str: string): ExpansionPlan {
  if (!str) {
    return new Plan(emptyNode)
  }

  // See expand(): a leading {} is escaped at the top level to mimic Bash.
  if (str.slice(0, 2) === '{}') {
    str = '\\{\\}' + str.slice(2)
  }

  return new Plan(compileNode(escapeBraces(str), true))
}

/**
 * Return the total number of expansions of `str` as a `bigint`, without
 * generating them. Equivalent to `compile(str).total`.
 */
export function expansionCount(str: string): bigint {
  return compile(str).total
}

// ---------------------------------------------------------------------------
// Compiled expansion tree
// ---------------------------------------------------------------------------

/**
 * A node describes an ordered list of "emissions":
 *
 * - `size`    total number of emissions (bigint, so nested products and
 *             huge numeric ranges cannot overflow);
 * - `empty`   how many of those emissions are the empty string;
 * - `emitAt`  render the emission at a flat ordinal;
 * - `locate`  weighted unranking: walk the emissions in order, where each
 *             empty emission contributes weight `wEmpty` and each
 *             non-empty emission weight `wNonEmpty`, returning the flat
 *             index landed on and the offset within that item's block;
 * - `isEmptyAt` whether the given flat ordinal emits the empty string.
 */
abstract class Node {
  abstract readonly size: bigint
  abstract readonly empty: bigint
  abstract emitAt(index: bigint): string
  abstract isEmptyAt(index: bigint): boolean
  abstract locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint }
}

class LiteralNode extends Node {
  readonly size = 1n
  constructor(
    readonly text: string,
    private readonly isEmpty: boolean,
  ) {
    super()
  }
  get empty(): bigint {
    return this.isEmpty ? 1n : 0n
  }
  emitAt(): string {
    return this.text
  }
  isEmptyAt(): boolean {
    return this.isEmpty
  }
  locate(rank: bigint): { idx: bigint; offset: bigint } {
    return { idx: 0n, offset: rank }
  }
}

class SequenceNode extends Node {
  readonly isAlpha: boolean
  readonly start: bigint
  readonly step: bigint
  readonly reverse: boolean
  readonly pad: boolean
  readonly width: number
  readonly size: bigint
  readonly emptyIndex: bigint | null

  constructor(parts: string[], isAlpha: boolean) {
    super()
    this.isAlpha = isAlpha
    const a = parts[0] as string
    const b = parts[1] as string
    this.start = isAlpha ? BigInt(a.charCodeAt(0)) : BigInt(a)
    const end = isAlpha ? BigInt(b.charCodeAt(0)) : BigInt(b)
    const stepRaw = parts[2]
    const given = stepRaw === undefined ? 1n : BigInt(numeric(stepRaw))
    this.step =
      given === 0n ? 1n
      : given < 0n ? -given
      : given
    this.reverse = end < this.start
    this.width = Math.max(a.length, b.length)
    // Padding is detected on all parts, so a padded increment keeps the
    // padding, including on a negative step, e.g. {-1..-09..-02}.
    this.pad = parts.some(isPadded)

    const span =
      (this.reverse ? this.start - end : end - this.start) / this.step
    this.size = span + 1n

    // Alphabetic ranges crossing '\\' emit a single empty member there,
    // exactly like expand() (it emits '' for that code point).
    this.emptyIndex = null
    if (isAlpha) {
      const backslash = BigInt('\\'.charCodeAt(0))
      if (
        (this.reverse ?
          this.start >= backslash && end <= backslash
        : this.start <= backslash && end >= backslash) &&
        (backslash - this.start) % this.step === 0n
      ) {
        this.emptyIndex =
          (this.reverse ?
            this.start - backslash
          : backslash - this.start) / this.step
      }
    }
  }

  get empty(): bigint {
    return this.emptyIndex === null ? 0n : 1n
  }

  isEmptyAt(index: bigint): boolean {
    return this.emptyIndex !== null && index === this.emptyIndex
  }

  emitAt(index: bigint): string {
    if (this.emptyIndex !== null && index === this.emptyIndex) {
      return ''
    }
    const value =
      this.reverse ?
        this.start - index * this.step
      : this.start + index * this.step
    if (this.isAlpha) {
      return String.fromCharCode(Number(value))
    }
    let c = value.toString()
    if (this.pad) {
      const need = this.width - c.length
      if (need > 0) {
        const z = '0'.repeat(need)
        c = value < 0n ? '-' + z + c.slice(1) : z + c
      }
    }
    return c
  }

  locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint } {
    const e = this.emptyIndex
    if (e === null || wEmpty === 0n) {
      // Uniform weight: skipping the empty item when wEmpty === 0n
      // requires compressing ordinal e.
      if (e === null) {
        return { idx: rank / wNonEmpty, offset: rank % wNonEmpty }
      }
      const before = e * wNonEmpty
      if (rank < before) {
        return { idx: rank / wNonEmpty, offset: rank % wNonEmpty }
      }
      return {
        idx: e + 1n + (rank - before) / wNonEmpty,
        offset: (rank - before) % wNonEmpty,
      }
    }
    // One exceptional block of weight wEmpty sitting at flat index e.
    const before = e * wNonEmpty
    if (rank < before) {
      return { idx: rank / wNonEmpty, offset: rank % wNonEmpty }
    }
    if (rank < before + wEmpty) {
      return { idx: e, offset: rank - before }
    }
    const after = rank - before - wEmpty
    return { idx: e + 1n + after / wNonEmpty, offset: after % wNonEmpty }
  }
}

class UnionNode extends Node {
  readonly size: bigint
  readonly empty: bigint
  private readonly cumulative: bigint[]

  constructor(readonly members: Node[]) {
    super()
    let total = 0n
    let empties = 0n
    this.cumulative = []
    for (const member of members) {
      this.cumulative.push(total)
      total += member.size
      empties += member.empty
    }
    this.size = total
    this.empty = empties
  }

  private memberContaining(index: bigint): number {
    // Member counts derive from option parts of the source string, never
    // from range cardinalities, so a binary search here is sufficient.
    let lo = 0
    let hi = this.members.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((this.cumulative[mid] as bigint) <= index) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return lo
  }

  emitAt(index: bigint): string {
    const i = this.memberContaining(index)
    return (this.members[i] as Node).emitAt(
      index - (this.cumulative[i] as bigint),
    )
  }

  isEmptyAt(index: bigint): boolean {
    const i = this.memberContaining(index)
    return (this.members[i] as Node).isEmptyAt(
      index - (this.cumulative[i] as bigint),
    )
  }

  locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint } {
    let remaining = rank
    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i] as Node
      const memberWeight =
        (member.size - member.empty) * wNonEmpty + member.empty * wEmpty
      if (remaining < memberWeight) {
        const hit = member.locate(remaining, wNonEmpty, wEmpty)
        return {
          idx: (this.cumulative[i] as bigint) + hit.idx,
          offset: hit.offset,
        }
      }
      remaining -= memberWeight
    }
    throw new RangeError('ordinal out of range')
  }
}

/** Every emission wrapped in braces, as produced by x{{a,b}}y. */
class EmbracedNode extends Node {
  readonly size: bigint
  constructor(readonly inner: Node) {
    super()
    this.size = inner.size
  }
  get empty(): bigint {
    // Braces are wrapped around the emission, so it is never empty.
    return 0n
  }
  emitAt(index: bigint): string {
    return '{' + this.inner.emitAt(index) + '}'
  }
  isEmptyAt(): boolean {
    return false
  }
  locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint } {
    void wEmpty
    // All wrapped emissions are non-empty.
    return this.inner.locate(rank, wNonEmpty, 0n)
  }
}

/** Ordered concatenation: pre text, brace section, post text, ... */
class CatNode extends Node {
  readonly size: bigint
  readonly empty: bigint
  private readonly suffixSize: bigint[]
  private readonly suffixEmpty: bigint[]

  constructor(readonly parts: Node[]) {
    super()
    const n = parts.length
    this.suffixSize = new Array<bigint>(n)
    this.suffixEmpty = new Array<bigint>(n)
    let total = 1n
    let empt = 1n
    for (let i = n - 1; i >= 0; i--) {
      this.suffixSize[i] = total
      this.suffixEmpty[i] = empt
      total *= (parts[i] as Node).size
      empt *= (parts[i] as Node).empty
    }
    this.size = total
    this.empty = empt
  }

  emitAt(index: bigint): string {
    let out = ''
    let rest = index
    for (let i = 0; i < this.parts.length; i++) {
      const sSize = this.suffixSize[i] as bigint
      const local = rest / sSize
      rest %= sSize
      out += (this.parts[i] as Node).emitAt(local)
    }
    return out
  }

  isEmptyAt(index: bigint): boolean {
    let rest = index
    for (let i = 0; i < this.parts.length; i++) {
      const sSize = this.suffixSize[i] as bigint
      const local = rest / sSize
      rest %= sSize
      if (!(this.parts[i] as Node).isEmptyAt(local)) {
        return false
      }
    }
    return true
  }

  /**
   * Weighted unranking across the Cartesian product of parts. A combo is
   * empty iff every chosen part is empty, so its weight is `wEmpty` then
   * and `wNonEmpty` otherwise. Parts are walked left to right and each
   * step is pure arithmetic (delegating to the part's own `locate`), so a
   * huge range followed by an empty option never iterates the range.
   */
  locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint } {
    let idx = 0n
    let r = rank
    let prefixEmpty = true
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i] as Node
      const sSize = this.suffixSize[i] as bigint
      const sEmpty = this.suffixEmpty[i] as bigint
      const sNonEmpty = sSize - sEmpty

      if (!prefixEmpty) {
        // Prefix already non-empty: every combo carries wNonEmpty.
        const block = wNonEmpty * sSize
        const j = r / block
        r %= block
        idx += j * sSize + (r % sSize)
        r %= sSize
        continue
      }

      // Prefix still empty: find the part emission by its weighted span.
      //   non-empty j: wNonEmpty across all sSize suffix combos;
      //   empty j:     wNonEmpty across sNonEmpty non-empty suffix combos,
      //                then wEmpty across sEmpty all-empty suffix combos.
      const hit = part.locate(
        r,
        wNonEmpty * sSize,
        sNonEmpty * wNonEmpty + sEmpty * wEmpty,
      )
      const j = hit.idx
      r = hit.offset
      idx += j * sSize

      if (!part.isEmptyAt(j)) {
        idx += r % sSize
        r %= sSize
        prefixEmpty = false
      } else if (r < sNonEmpty * wNonEmpty) {
        idx += r % sSize
        r %= sSize
        prefixEmpty = false
      } else {
        r -= sNonEmpty * wNonEmpty
        r %= sEmpty === 0n ? 1n : sEmpty
      }
    }
    return { idx, offset: r }
  }
}

/** Top-level filter that drops empty emissions, like expand(isTop=true). */
class FilterNode extends Node {
  readonly size: bigint
  readonly empty = 0n
  constructor(readonly inner: Node) {
    super()
    this.size = inner.size - inner.empty
  }
  emitAt(index: bigint): string {
    const { idx } = this.inner.locate(index, 1n, 0n)
    return this.inner.emitAt(idx)
  }
  isEmptyAt(): boolean {
    return false
  }
  locate(
    rank: bigint,
    wNonEmpty: bigint,
    wEmpty: bigint,
  ): { idx: bigint; offset: bigint } {
    void wEmpty
    return this.inner.locate(rank, wNonEmpty, 0n)
  }
}

const emptyNode = new UnionNode([])

class Plan implements ExpansionPlan {
  constructor(readonly root: Node) {}

  get total(): bigint {
    return this.root.size
  }

  at(index: number | bigint): string {
    const i = toBigInt(index, 'index')
    if (i < 0n || i >= this.root.size) {
      throw new RangeError(
        `expansion index ${i} is out of range (total ${this.root.size})`,
      )
    }
    return unescapeBraces(this.root.emitAt(i))
  }

  take(start: number | bigint, count?: number | bigint): string[] {
    const s = toBigInt(start, 'start')
    if (s < 0n) {
      throw new RangeError(`start ${s} must be non-negative`)
    }
    let remaining = this.root.size - s
    if (remaining < 0n) {
      remaining = 0n
    }
    let n: bigint
    if (count === undefined) {
      n = remaining
    } else {
      const c = toBigInt(count, 'count')
      if (c < 0n) {
        throw new RangeError(`count ${c} must be non-negative`)
      }
      n = c < remaining ? c : remaining
    }
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(
        `requested ${n} expansions exceeds the maximum array length; ` +
          'read a smaller slice',
      )
    }
    const out: string[] = []
    const limit = Number(n)
    for (let i = 0; i < limit; i++) {
      out.push(unescapeBraces(this.root.emitAt(s + BigInt(i))))
    }
    return out
  }
}

function toBigInt(value: number | bigint, name: string): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer or bigint`)
  }
  return BigInt(value)
}

function literal(text: string): Node {
  return new LiteralNode(text, text === '')
}

/** Flatten nested concatenations and merge adjacent literal text. */
function concatenate(parts: Node[]): Node {
  const flat: Node[] = []
  for (const part of parts) {
    if (part instanceof CatNode) {
      flat.push(...part.parts)
    } else {
      flat.push(part)
    }
  }
  const merged: Node[] = []
  for (const part of flat) {
    const last = merged[merged.length - 1]
    if (part instanceof LiteralNode && last instanceof LiteralNode) {
      merged[merged.length - 1] = literal(last.text + part.text)
    } else {
      merged.push(part)
    }
  }
  // Drop harmless empty literals, but keep one if the whole thing is empty.
  const withoutEmpty = merged.filter(
    node => !(node instanceof LiteralNode && node.text === ''),
  )
  const finalParts = withoutEmpty.length ? withoutEmpty : [literal('')]
  if (finalParts.length === 1) {
    return finalParts[0] as Node
  }
  return new CatNode(finalParts)
}

function compileNode(str: string, isTop: boolean): Node {
  const m = balanced('{', '}', str)
  if (!m) {
    return literal(str)
  }

  const pre = m.pre
  const post = m.post.length ? compileNode(m.post, false) : literal('')

  if (/\$$/.test(m.pre)) {
    // ${...} never expands; braces are preserved literally while the tail
    // keeps expanding, mirroring expand_().
    return concatenate([literal(pre), literal('{' + m.body + '}'), post])
  }

  const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body)
  const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(
    m.body,
  )
  const isSequence = isNumericSequence || isAlphaSequence
  const isOptions = m.body.indexOf(',') >= 0

  if (!isSequence && !isOptions) {
    // {a},b}
    if (m.post.match(/,(?!,).*\}/)) {
      // expand_() re-enters at the top level (isTop = true) here.
      return compileNode(m.pre + '{' + m.body + escClose + m.post, true)
    }
    return literal(str)
  }

  let braceNode: Node
  if (isSequence) {
    braceNode = new SequenceNode(m.body.split(/\.\./), isAlphaSequence)
  } else {
    const commaParts = parseCommaParts(m.body)
    if (commaParts.length === 1 && commaParts[0] !== undefined) {
      // x{{a,b}}y ==> x{a}y x{b}y
      const inner = compileNode(commaParts[0], false)
      if (inner instanceof UnionNode && inner.members.length > 1) {
        braceNode = new UnionNode(
          inner.members.map(memberNode => new EmbracedNode(memberNode)),
        )
      } else {
        // Mirrors the effectively unreachable single-result branch of
        // expand_(): the braces survive literally.
        return concatenate([literal(m.pre), new EmbracedNode(inner), post])
      }
    } else {
      braceNode = new UnionNode(
        commaParts.map(part => compileNode(part as string, false)),
      )
    }
  }

  const whole = concatenate([literal(pre), braceNode, post])
  // expand_() drops empty emissions only at the top level and only for
  // option sets (not sequences, not the ${...} literal branch).
  if (isTop && !isSequence && whole.empty > 0n) {
    return new FilterNode(whole)
  }
  return whole
}
