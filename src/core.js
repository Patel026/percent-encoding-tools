/**
 * Byte-level percent encoding for arbitrary JavaScript strings.
 *
 * Design decisions, stated up front so callers are not surprised:
 *
 * 1. Input strings are converted to UTF-8 bytes first, then each byte that
 *    is not in the caller's allowed set is written as `%XX` with uppercase
 *    hex digits. This matches RFC 3986's recommendation to normalize hex
 *    case and it means a round trip through encode/decode is byte-exact for
 *    any string, including lone surrogates (which UTF-8 replaces with
 *    U+FFFD).
 *
 * 2. The default allowed set for `encode` is the RFC 3986 "unreserved"
 *    set: ALPHA / DIGIT / "-" / "." / "_" / "~". Everything else is
 *    escaped. `encodeComponent` additionally allows the sub-delims and a
 *    few punctuation characters that are safe inside a single URL
 *    component but not in a whole URL.
 *
 * 3. `decode` is strict. A `%` that is not followed by two hex digits, or
 *    a byte sequence that is not valid UTF-8, throws a TypeError. Silent
 *    replacement of malformed input is how URL bugs hide; callers who want
 *    lenient behaviour should catch and decide for themselves.
 */

const HEX = '0123456789ABCDEF';

/**
 * RFC 3986 unreserved characters. These never need escaping in any part of
 * a URI, so they are the default allowed set.
 */
const UNRESERVED =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Characters allowed by `encodeComponent`. This is the unreserved set plus
 * the sub-delims (`!$&'()*+,;=`) and `:@`, which are safe inside a path
 * segment or query value. Notably `/`, `?`, `#`, `[`, and `]` are NOT
 * included: those change the structure of a URL and must be escaped when
 * they appear as data.
 */
const COMPONENT =
  UNRESERVED + "!$&'()*+,;=:@";

/**
 * Lookup tables are built once at module load. A Set membership test per
 * byte is fast enough for URL-sized inputs and keeps the hot loop short.
 */
const UNRESERVED_SET = new Set(UNRESERVED);
const COMPONENT_SET = new Set(COMPONENT);

/**
 * Convert a JavaScript string to UTF-8 bytes.
 *
 * TextEncoder is a standard global in Node and in every browser we target.
 * It replaces unpaired surrogates with U+FFFD, which is the only lossy
 * behaviour in the whole library and is documented in the README.
 *
 * @param {string} input
 * @returns {Uint8Array}
 */
function toUtf8Bytes(input) {
  return new TextEncoder().encode(input);
}

/**
 * Convert UTF-8 bytes back to a string.
 *
 * `fatal: true` makes TextDecoder throw on invalid UTF-8 instead of
 * substituting U+FFFD. That is what turns a corrupt escape sequence into a
 * loud error rather than silent data loss.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function fromUtf8Bytes(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Percent-encode a string using an explicit allowed set.
 *
 * @param {string} input
 * @param {Set<string>} allowed characters that pass through unescaped
 * @returns {string}
 */
function encodeWithSet(input, allowed) {
  if (typeof input !== 'string') {
    throw new TypeError('encode expects a string');
  }
  const bytes = toUtf8Bytes(input);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    const ch = String.fromCharCode(byte);
    if (allowed.has(ch)) {
      out += ch;
    } else {
      out += '%' + HEX[(byte >> 4) & 0xf] + HEX[byte & 0xf];
    }
  }
  return out;
}

/**
 * Percent-encode a whole string, escaping everything outside the RFC 3986
 * unreserved set.
 *
 * @param {string} input
 * @returns {string}
 */
export function encode(input) {
  return encodeWithSet(input, UNRESERVED_SET);
}

/**
 * Percent-encode a single URL component. Use this for path segments, query
 * parameter values, and fragment text; use `encode` for data that must not
 * contain any structural characters at all.
 *
 * @param {string} input
 * @returns {string}
 */
export function encodeComponent(input) {
  return encodeWithSet(input, COMPONENT_SET);
}

const HEX_VALUES = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < HEX.length; i++) {
    table[HEX.charCodeAt(i)] = i;
    table[HEX.toLowerCase().charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decode a percent-encoded string.
 *
 * Strictness is deliberate: `%` must be followed by two hex digits and the
 * resulting byte sequence must be valid UTF-8. Anything else is a bug in
 * the caller's data, and a thrown TypeError is easier to trace than a
 * string that quietly contains U+FFFD.
 *
 * @param {string} input
 * @returns {string}
 */
export function decode(input) {
  if (typeof input !== 'string') {
    throw new TypeError('decode expects a string');
  }
  const bytes = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '%') {
      if (i + 2 >= input.length) {
        throw new TypeError(
          `truncated percent escape at index ${i} of ${JSON.stringify(input)}`
        );
      }
      const hi = input.charCodeAt(i + 1);
      const lo = input.charCodeAt(i + 2);
      const high = hi < 128 ? HEX_VALUES[hi] : -1;
      const low = lo < 128 ? HEX_VALUES[lo] : -1;
      if (high < 0 || low < 0) {
        throw new TypeError(
          `invalid percent escape at index ${i} of ${JSON.stringify(input)}`
        );
      }
      bytes.push((high << 4) | low);
      i += 2;
    } else {
      // Non-ASCII characters in the input are taken as already-decoded
      // text and re-encoded to UTF-8 so the final TextDecoder sees a
      // consistent byte stream. This makes `decode('caf\u00e9')` return
      // 'caf\u00e9' rather than throwing, which matches how browsers treat
      // mixed encoded/raw input in a URL.
      const code = input.codePointAt(i);
      if (code > 0xffff) {
        i++;
      }
      const encoded = toUtf8Bytes(String.fromCodePoint(code));
      for (let j = 0; j < encoded.length; j++) {
        bytes.push(encoded[j]);
      }
    }
  }
  try {
    return fromUtf8Bytes(Uint8Array.from(bytes));
  } catch (err) {
    throw new TypeError('percent-encoded input is not valid UTF-8');
  }
}

/**
 * Decode a single URL component. Identical to `decode` in this library:
 * decoding does not need to know which characters were allowed during
 * encoding, because every `%XX` is unambiguously an escape. The function
 * exists so that call sites read symmetrically with `encodeComponent`.
 *
 * @param {string} input
 * @returns {string}
 */
export function decodeComponent(input) {
  return decode(input);
}

/**
 * Return true if `input` contains at least one complete, well-formed
 * percent escape. This is a cheap predicate for deciding whether a string
 * needs decoding; it does not validate the whole string.
 *
 * @param {string} input
 * @returns {boolean}
 */
export function isEncoded(input) {
  if (typeof input !== 'string') {
    return false;
  }
  for (let i = 0; i < input.length - 2; i++) {
    if (input[i] !== '%') continue;
    const hi = input.charCodeAt(i + 1);
    const lo = input.charCodeAt(i + 2);
    if (
      hi < 128 &&
      lo < 128 &&
      HEX_VALUES[hi] >= 0 &&
      HEX_VALUES[lo] >= 0
    ) {
      return true;
    }
  }
  return false;
}
