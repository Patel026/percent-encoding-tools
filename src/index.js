/**
 * Public entry point for percent-encoding-tools.
 *
 * The implementation lives in ./core.js so that consumers can import the
 * individual helpers without pulling in anything else. Re-exporting here
 * keeps a single, stable import path for the README examples.
 */
export {
  encode,
  decode,
  encodeComponent,
  decodeComponent,
  isEncoded,
} from './core.js';
