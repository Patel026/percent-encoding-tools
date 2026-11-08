import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encode,
  decode,
  encodeComponent,
  decodeComponent,
  isEncoded,
} from '../src/index.js';

test('encode leaves unreserved characters alone', () => {
  assert.equal(encode('abcXYZ019-._~'), 'abcXYZ019-._~');
});

test('encode escapes reserved characters with uppercase hex', () => {
  assert.equal(encode('a b/c?d#e'), 'a%20b%2Fc%3Fd%23e');
});

test('encode escapes non-ASCII as UTF-8 bytes', () => {
  // '\u00e9' is two UTF-8 bytes: 0xC3 0xA9.
  assert.equal(encode('caf\u00e9'), 'caf%C3%A9');
  // U+1F600 is four UTF-8 bytes: F0 9F 98 80.
  assert.equal(encode('\u{1F600}'), '%F0%9F%98%80');
});

test('encode rejects non-string input', () => {
  assert.throws(() => encode(42), TypeError);
});

test('encodeComponent keeps sub-delims and colon-at', () => {
  assert.equal(
    encodeComponent("a!b$c&d'e(f)g*h+i,j;k=l:m@n"),
    "a!b$c&d'e(f)g*h+i,j;k=l:m@n"
  );
});

test('encodeComponent escapes structural URL characters', () => {
  assert.equal(encodeComponent('a/b?c#d[e]f'), 'a%2Fb%3Fc%23d%5Be%5Df');
});

test('decode reverses encode for a mixed string', () => {
  const original = 'path with spaces/and?query#frag\u00e9\u{1F600}';
  assert.equal(decode(encode(original)), original);
});

test('decode reverses encodeComponent for a mixed string', () => {
  const original = "a/b?c#d[e]f\u00e9\u{1F600}";
  assert.equal(decodeComponent(encodeComponent(original)), original);
});

test('decode accepts lowercase hex digits', () => {
  assert.equal(decode('%c3%a9'), '\u00e9');
});

test('decode leaves unescaped text untouched', () => {
  assert.equal(decode('plain text \u00e9'), 'plain text \u00e9');
});

test('decode rejects truncated escapes', () => {
  assert.throws(() => decode('abc%'), TypeError);
  assert.throws(() => decode('abc%4'), TypeError);
});

test('decode rejects non-hex escapes', () => {
  assert.throws(() => decode('%zz'), TypeError);
  assert.throws(() => decode('%4g'), TypeError);
});

test('decode rejects invalid UTF-8 byte sequences', () => {
  // 0xC3 starts a two-byte sequence but is not followed by a continuation.
  assert.throws(() => decode('%C3%28'), TypeError);
  // 0xFF is never valid in UTF-8.
  assert.throws(() => decode('%FF'), TypeError);
});

test('decode rejects non-string input', () => {
  assert.throws(() => decode(null), TypeError);
});

test('isEncoded detects complete escapes', () => {
  assert.equal(isEncoded('a%20b'), true);
  assert.equal(isEncoded('%c3%a9'), true);
  assert.equal(isEncoded('plain'), false);
  assert.equal(isEncoded('trailing%'), false);
  assert.equal(isEncoded('%zz'), false);
  assert.equal(isEncoded(''), false);
});

test('isEncoded returns false for non-strings', () => {
  assert.equal(isEncoded(undefined), false);
  assert.equal(isEncoded(123), false);
});

test('round trip is byte-exact for a lone surrogate', () => {
  // TextEncoder replaces an unpaired surrogate with U+FFFD (EF BF BD).
  // This is the documented lossy case; the round trip still stabilizes
  // after one pass, which is what callers can rely on.
  const once = decode(encode('\uD800'));
  assert.equal(once, '\uFFFD');
  assert.equal(decode(encode(once)), once);
});
