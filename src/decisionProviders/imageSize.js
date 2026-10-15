/**
 * Image header reading
 *
 * Reads pixel dimensions from PNG and JPEG headers so a host's size limits can
 * be checked before upload, without an image library.
 */

const PNG_SIGNATURE = 0x89504e47;

// JPEG start-of-frame markers carry the dimensions; C4 (DHT), C8 (JPG), and
// CC (DAC) share the range but are not frames.
function isStartOfFrame(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

// Markers that stand alone, with no length field: TEM, RST0–7, SOI.
function isStandalone(marker) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
}

function readPng(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  // An acTL chunk ahead of the first IDAT marks an animated PNG.
  const actl = buffer.indexOf('acTL');
  const idat = buffer.indexOf('IDAT');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    animated: actl !== -1 && (idat === -1 || actl < idat),
  };
}

function readJpeg(buffer) {
  let offset = 2;
  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (isStandalone(marker)) {
      offset += 2;
      continue;
    }
    if (isStartOfFrame(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), animated: false };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

/**
 * @param {Buffer} buffer - Image file bytes
 * @returns {{ width: number, height: number, animated: boolean }|null} null
 *   when the bytes are not a PNG or JPEG this reader understands
 */
export function readImageSize(buffer) {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === PNG_SIGNATURE) return readPng(buffer);
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return readJpeg(buffer);
  return null;
}
