# percent-encoding-tools

Encode and decode arbitrary JavaScript strings as URL-safe percent escapes, byte by byte, with no dependencies.

```js
import {
  encode,
  decode,
  encodeComponent,
  decodeComponent,
  isEncoded,
} from './src/index.js';

encode('a b/c');            // 'a%20b%2Fc'
encodeComponent('a b/c');   // 'a%20b%2Fc'  (same here; see below)
decode('caf%C3%A9');        // 'caf\u00e9'
decodeComponent('a%20b');   // 'a b'
isEncoded('a%20b');         // true
isEncoded('plain');         // false
```

The example imports from `./src/index.js` because that is the file this repository ships. Published consumers would import from the package name instead.

## Why this exists

`encodeURIComponent` is built for whole URLs and quietly leaves `!'()*` unescaped, which is wrong for OAuth signatures, form bodies, and any context that expects the RFC 3986 unreserved set. It also throws on lone surrogates rather than defining what happens. This library makes the allowed set explicit and works on UTF-8 bytes, so every string has a well-defined encoding.

The trade-off: encoding is strict and decoding is strict. A malformed `%` escape or an invalid UTF-8 byte sequence throws a `TypeError` instead of being replaced with `U+FFFD`. That is the right default for data you control, and it is the wrong default for scraping arbitrary web pages; callers who need lenient behaviour should catch the error and substitute themselves.

## The awkward edge

Unpaired UTF-16 surrogates cannot be represented in UTF-8. `TextEncoder` replaces them with `U+FFFD` (the replacement character), so `encode('\uD800')` produces `%EF%BF%BD` and decoding gives back `'\uFFFD'`, not the original surrogate. This is the one lossy case, and it is stable: the second round trip is an identity. If you need to preserve lone surrogates exactly, encode the UTF-16 code units yourself.

## API

- `encode(input: string): string` — escape everything outside the RFC 3986 unreserved set (`A-Z a-z 0-9 - . _ ~`).
- `encodeComponent(input: string): string` — same, but also leaves the sub-delims and `:@` unescaped. Use this for a single path segment or query value. Structural characters `/ ? # [ ]` are still escaped.
- `decode(input: string): string` — decode `%XX` escapes and validate the result as UTF-8. Throws `TypeError` on truncated escapes, non-hex digits, or invalid UTF-8.
- `decodeComponent(input: string): string` — alias for `decode`. Decoding does not need to know which characters were allowed during encoding, because every escape is unambiguous. The name exists so call sites read symmetrically.
- `isEncoded(input: string): boolean` — true if the string contains at least one complete, well-formed `%XX` escape. Cheap predicate, not a full validator.

All exported functions reject non-string arguments with a `TypeError`.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

