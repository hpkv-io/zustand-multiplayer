/**
 * Encode/decode keys to handle special characters safely
 */

/**
 * Encode a key segment to make it safe for storage
 * Encodes special characters that could interfere with path delimiters
 */
export function encodeKeySegment(segment: string): string {
  // Encode special characters that could interfere with delimiters
  return segment
    .replace(/%/g, '%25') // Encode % first to avoid double encoding
    .replace(/:/g, '%3A') // Colon is used as path delimiter in storage
    .replace(/\./g, '%2E') // Dot is used as path delimiter in state paths
    .replace(/\|/g, '%7C') // Pipe
    .replace(/\$/g, '%24') // Dollar sign
    .replace(/#/g, '%23') // Hash
    .replace(/&/g, '%26') // Ampersand
    .replace(/=/g, '%3D') // Equals
    .replace(/\+/g, '%2B') // Plus
    .replace(/\s/g, '%20'); // Spaces
}

/**
 * Decode a key segment back to its original form
 */
export function decodeKeySegment(segment: string): string {
  // Decode in reverse order of encoding
  return segment
    .replace(/%20/g, ' ') // Spaces
    .replace(/%2B/g, '+') // Plus
    .replace(/%3D/g, '=') // Equals
    .replace(/%26/g, '&') // Ampersand
    .replace(/%23/g, '#') // Hash
    .replace(/%24/g, '$') // Dollar sign
    .replace(/%7C/g, '|') // Pipe
    .replace(/%2E/g, '.') // Dot
    .replace(/%3A/g, ':') // Colon
    .replace(/%25/g, '%'); // Percent (decode last)
}

/**
 * Encode an array of path segments
 */
export function encodePathSegments(segments: string[]): string[] {
  return segments.map(encodeKeySegment);
}

/**
 * Decode an array of path segments
 */
export function decodePathSegments(segments: string[]): string[] {
  return segments.map(decodeKeySegment);
}
