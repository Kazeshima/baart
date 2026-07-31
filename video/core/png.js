const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function readPngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("File is not a valid PNG image.");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG is missing its IHDR chunk.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function readPngColorType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 26 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG file.");
  }
  return buffer[25];
}
