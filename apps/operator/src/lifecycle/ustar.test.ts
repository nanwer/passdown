import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { tarArchive, readTar, tarSize } from './ustar';

async function bytes(source: AsyncIterable<Uint8Array>) {
  const parts: Buffer[] = [];
  for await (const part of source) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}
const entry = (name: string, value: string) => ({
  name,
  size: Buffer.byteLength(value),
  content: Readable.from([Buffer.from(value)]),
});
describe('strict backup archive', () => {
  it('streams an interoperable deterministic archive with exact sizes', async () => {
    const archive = await bytes(
      tarArchive([entry('database.dump', 'database'), entry('manifest.json', '{}')]),
    );
    expect(archive.length).toBe(tarSize([8, 2]));
    const result: Record<string, string> = {};
    for await (const member of readTar(Readable.from([archive])))
      result[member.name] = (await bytes(member.content)).toString();
    expect(result).toEqual({ 'database.dump': 'database', 'manifest.json': '{}' });
    expect(
      await bytes(tarArchive([entry('database.dump', 'database'), entry('manifest.json', '{}')])),
    ).toEqual(archive);
  });
  it.each(['../secret', '/absolute', 'a/../../secret', 'a\\file', 'a//file'])(
    'refuses unsafe member %s',
    async (name) => {
      await expect(bytes(tarArchive([entry(name, 'x')]))).rejects.toThrow('name');
    },
  );
  it('rejects truncation, altered headers and extra nonzero data', async () => {
    const archive = await bytes(tarArchive([entry('media.tar', 'x')]));
    for (const bad of [archive.subarray(0, 700), Buffer.concat([archive, Buffer.from('extra')])]) {
      await expect(
        (async () => {
          for await (const member of readTar(Readable.from([bad]))) await bytes(member.content);
        })(),
      ).rejects.toThrow();
    }
    archive[0] ^= 1;
    await expect(
      (async () => {
        for await (const member of readTar(Readable.from([archive]))) await bytes(member.content);
      })(),
    ).rejects.toThrow('checksum');
  });
  it('supports canonical long workspace paths using ustar prefixes', async () => {
    const name = 'w'.repeat(100) + '/11111111-1111-1111-1111-111111111111.display.webp';
    const archive = await bytes(tarArchive([entry(name, 'image')]));
    const names = [];
    for await (const member of readTar(Readable.from([archive]))) {
      names.push(member.name);
      await bytes(member.content);
    }
    expect(names).toEqual([name]);
  });
  it('refuses a source whose bytes differ from its declared length', async () => {
    await expect(bytes(tarArchive([{ ...entry('media.tar', 'abc'), size: 2 }]))).rejects.toThrow(
      'size',
    );
    await expect(bytes(tarArchive([{ ...entry('media.tar', 'abc'), size: 4 }]))).rejects.toThrow(
      'size',
    );
  });
});
