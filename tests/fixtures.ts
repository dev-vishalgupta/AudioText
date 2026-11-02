export function wav(seconds = 1) {
  const rate = 8000, length = Math.floor(seconds * rate * 2), b = Buffer.alloc(44 + length);
  b.write("RIFF", 0); b.writeUInt32LE(36 + length, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(length, 40);
  for (let i = 0; i < length / 2; i++) b.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000), 44 + i * 2);
  return b;
}
