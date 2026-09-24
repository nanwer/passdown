/** Restricted regular-file ustar for backup transport. No extensions or links. */
export type TarEntry = { name: string; size: number; content: AsyncIterable<Uint8Array> };
const block = 512;
const padding = (size: number) => (block - (size % block)) % block;
function safeName(name: string) {
  if (
    !name ||
    Buffer.byteLength(name) > 255 ||
    !/^[a-zA-Z0-9_.\/-]+$/.test(name) ||
    name.startsWith('/') ||
    name.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Invalid archive member name.');
}
function checkedSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 0o77777777777)
    throw new Error('Invalid archive member size.');
}
export function tarSize(sizes: number[]) {
  for (const size of sizes) checkedSize(size);
  return sizes.reduce((total, size) => total + block + size + padding(size), 1024);
}
function header(name: string, size: number) {
  safeName(name);
  checkedSize(size);
  const h = Buffer.alloc(block);
  if (Buffer.byteLength(name) <= 100) h.write(name, 0, 100, 'ascii');
  else {
    const split = name.lastIndexOf('/');
    const prefix = name.slice(0, split),
      leaf = name.slice(split + 1);
    if (split < 1 || prefix.length > 155 || leaf.length > 100)
      throw new Error('Invalid archive member name.');
    h.write(leaf, 0, 100, 'ascii');
    h.write(prefix, 345, 155, 'ascii');
  }
  for (const [offset, width, value] of [
    [100, 8, 0o600],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, size],
    [136, 12, 0],
  ])
    h.write(value.toString(8).padStart(width - 1, '0') + '\0', offset, width, 'ascii');
  h.fill(32, 148, 156);
  h[156] = 48;
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  const checksum = h.reduce((sum, value) => sum + value, 0);
  h.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}
export async function* tarArchive(entries: Iterable<TarEntry>): AsyncGenerator<Buffer> {
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error('Duplicate archive member name.');
    names.add(entry.name);
    yield header(entry.name, entry.size);
    let size = 0;
    for await (const chunk of entry.content) {
      size += chunk.byteLength;
      if (size > entry.size) throw new Error('Archive source size changed.');
      yield Buffer.from(chunk);
    }
    if (size !== entry.size) throw new Error('Archive source size changed.');
    if (padding(size)) yield Buffer.alloc(padding(size));
  }
  yield Buffer.alloc(1024);
}
class ByteReader {
  private iterator: AsyncIterator<Uint8Array>;
  private chunk = Buffer.alloc(0);
  constructor(source: AsyncIterable<Uint8Array>) {
    this.iterator = source[Symbol.asyncIterator]();
  }
  async take(count: number): Promise<Buffer> {
    const pieces: Buffer[] = [];
    let remaining = count;
    while (remaining) {
      if (!this.chunk.length) {
        const next = await this.iterator.next();
        if (next.done) throw new Error('Truncated archive.');
        this.chunk = Buffer.from(next.value);
        if (!this.chunk.length) continue;
      }
      const length = Math.min(remaining, this.chunk.length);
      pieces.push(this.chunk.subarray(0, length));
      this.chunk = this.chunk.subarray(length);
      remaining -= length;
    }
    return Buffer.concat(pieces, count);
  }
  async end() {
    if (this.chunk.some((byte) => byte !== 0)) throw new Error('Unexpected data after archive.');
    for (let next = await this.iterator.next(); !next.done; next = await this.iterator.next())
      if (next.value.some((byte) => byte !== 0)) throw new Error('Unexpected data after archive.');
  }
  async close() {
    await this.iterator.return?.();
  }
}
function octal(h: Buffer, start: number, length: number) {
  const text = h
    .subarray(start, start + length)
    .toString('ascii')
    .replace(/\0.*$/, '')
    .trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('Invalid archive numeric field.');
  return Number.parseInt(text, 8);
}
export async function* readTar(source: AsyncIterable<Uint8Array>): AsyncGenerator<TarEntry> {
  const reader = new ByteReader(source);
  const names = new Set<string>();
  try {
    while (true) {
      const h = await reader.take(block);
      if (h.every((byte) => byte === 0)) {
        if ((await reader.take(block)).some((byte) => byte !== 0))
          throw new Error('Invalid archive terminator.');
        await reader.end();
        return;
      }
      const expected = octal(h, 148, 8);
      const copied = Buffer.from(h);
      copied.fill(32, 148, 156);
      if (copied.reduce((sum, byte) => sum + byte, 0) !== expected)
        throw new Error('Archive header checksum mismatch.');
      if (
        h.subarray(257, 263).toString() !== 'ustar\0' ||
        h.subarray(263, 265).toString() !== '00' ||
        h[156] !== 48 ||
        h.subarray(157, 257).some((byte) => byte !== 0)
      )
        throw new Error('Unsupported archive member type.');
      const field = (start: number, length: number) => {
        const bytes = h.subarray(start, start + length);
        if (bytes.some((byte) => byte > 127)) throw new Error('Invalid archive member name.');
        const zero = bytes.indexOf(0);
        if (zero >= 0 && bytes.subarray(zero).some((byte) => byte !== 0))
          throw new Error('Invalid archive member name.');
        return bytes.toString('ascii').replace(/\0.*$/, '');
      };
      const prefix = field(345, 155);
      const name = (prefix ? prefix + '/' : '') + field(0, 100);
      safeName(name);
      if (names.has(name)) throw new Error('Duplicate archive member name.');
      names.add(name);
      const size = octal(h, 124, 12);
      checkedSize(size);
      let remaining = size;
      async function* content() {
        while (remaining) {
          const chunk = await reader.take(Math.min(remaining, 64 * 1024));
          remaining -= chunk.length;
          yield chunk;
        }
      }
      yield { name, size, content: content() };
      if (remaining) throw new Error('Archive member was not consumed.');
      if ((await reader.take(padding(size))).some((byte) => byte !== 0))
        throw new Error('Invalid archive padding.');
    }
  } finally {
    await reader.close();
  }
}
