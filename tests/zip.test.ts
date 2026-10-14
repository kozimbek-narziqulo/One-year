import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { crc32, createZip, looksLikeZip, openZip, ZipError, type ZipEntry } from "../lib/zip.ts";

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** ZIP со сжатием deflate, как его собирает архиватор компьютера (в том числе с папкой и «мусором» macOS). */
function deflateZip(files: { name: string; data: Uint8Array; declaredSize?: number }[]): Blob {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const enc = new TextEncoder();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const comp = new Uint8Array(deflateRawSync(f.data));
    const crc = crc32(f.data);
    const usize = f.declaredSize ?? f.data.length;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0808, true); // UTF-8 + размеры в дескрипторе после данных
    lv.setUint16(8, 8, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const dd = new Uint8Array(16);
    const dv = new DataView(dd.buffer);
    dv.setUint32(0, 0x08074b50, true);
    dv.setUint32(4, crc, true);
    dv.setUint32(8, comp.length, true);
    dv.setUint32(12, usize, true);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0808, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, usize, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    parts.push(lh, comp, dd);
    offset += lh.length + comp.length + dd.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd] as BlobPart[]);
}

test("crc32 совпадает с известным значением", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("запись и чтение: текст, байты, Blob, кириллица в содержимом", async () => {
  const bin = new Uint8Array(1000).map((_, i) => i % 251);
  const zip = await createZip([
    { name: "a.txt", data: "привет, сад" },
    { name: "dir/b.bin", data: bin },
    { name: "c.bin", data: new Blob([bin]) },
    { name: "empty.txt", data: "" },
  ]);
  assert.equal(zip.type, "application/zip");
  const z = await openZip(zip);
  assert.deepEqual(z.entries.map((e) => e.name), ["a.txt", "dir/b.bin", "c.bin", "empty.txt"]);
  const get = (n: string) => z.entries.find((e) => e.name === n) as ZipEntry;
  assert.equal(text(await z.read(get("a.txt"), 1e6)), "привет, сад");
  assert.deepEqual(await z.read(get("dir/b.bin"), 1e6), bin);
  assert.deepEqual(await z.read(get("c.bin"), 1e6), bin);
  assert.equal((await z.read(get("empty.txt"), 1e6)).length, 0);
});

test("отчёт о ходе и отказ на повторяющихся именах", async () => {
  const seen: number[] = [];
  await createZip([{ name: "a", data: "1" }, { name: "b", data: "2" }], { onProgress: (d) => seen.push(d) });
  assert.deepEqual(seen, [1, 2]);
  await assert.rejects(createZip([{ name: "a", data: "1" }, { name: "a", data: "2" }]), ZipError);
});

test("пустой архив открывается", async () => {
  const z = await openZip(await createZip([]));
  assert.deepEqual(z.entries, []);
});

test("looksLikeZip отличает архив от текста", async () => {
  assert.equal(await looksLikeZip(await createZip([{ name: "a", data: "x" }])), true);
  assert.equal(await looksLikeZip(await createZip([])), true);
  assert.equal(await looksLikeZip(new Blob(['{"app":1}'])), false);
  assert.equal(await looksLikeZip(new Blob([])), false);
});

test("комментарий в конце архива не мешает", async () => {
  const base = await bytesOf(await createZip([{ name: "a", data: "x" }]));
  const comment = new TextEncoder().encode("PK\x05\x06 не конец");
  const out = new Uint8Array(base.length + comment.length);
  out.set(base);
  out.set(comment, base.length);
  new DataView(out.buffer).setUint16(base.length - 2, comment.length, true);
  const z = await openZip(new Blob([out]));
  assert.equal(text(await z.read(z.entries[0] as ZipEntry, 100)), "x");
});

test("deflate-архив, собранный другим архиватором, читается", async () => {
  const body = "строка ".repeat(500);
  const z = await openZip(
    deflateZip([
      { name: "папка/", data: new Uint8Array(0) },
      { name: "папка/backup.json", data: new TextEncoder().encode(body) },
    ]),
  );
  const e = z.entries.find((x) => x.name === "папка/backup.json") as ZipEntry;
  assert.equal(e.method, 8);
  assert.equal(text(await z.read(e, 1e6)), body);
});

test("повреждение данных ловится контрольной суммой", async () => {
  const bytes = await bytesOf(await createZip([{ name: "a.txt", data: "0123456789" }]));
  bytes[30 + 5 + 3] ^= 0xff; // середина данных
  const z = await openZip(new Blob([bytes]));
  await assert.rejects(z.read(z.entries[0] as ZipEntry, 100), /контрольная сумма/);
});

test("мусор, обрезанный архив и архив без конца отвергаются понятной ошибкой", async () => {
  await assert.rejects(openZip(new Blob(["просто текст, а не архив, и длинный достаточно"])), ZipError);
  await assert.rejects(openZip(new Blob(["PK"])), ZipError);
  const bytes = await bytesOf(await createZip([{ name: "a.txt", data: "hello" }]));
  await assert.rejects(openZip(new Blob([bytes.subarray(0, bytes.length - 10)])), ZipError);
});

test("потолок размера и «бомба»: заявленный размер меньше фактического", async () => {
  const z1 = await openZip(await createZip([{ name: "big", data: new Uint8Array(5000) }]));
  await assert.rejects(z1.read(z1.entries[0] as ZipEntry, 1000), /слишком большой/);

  const big = new Uint8Array(100_000);
  const z2 = await openZip(deflateZip([{ name: "x", data: big, declaredSize: 10 }]));
  await assert.rejects(z2.read(z2.entries[0] as ZipEntry, 1e6), ZipError);
});

test("архив с паролем и неизвестный способ сжатия отвергаются при чтении файла", async () => {
  const bytes = await bytesOf(await createZip([{ name: "a.txt", data: "hello" }]));
  const enc = bytes.slice();
  const cdOff = new DataView(enc.buffer).getUint32(enc.length - 22 + 16, true);
  new DataView(enc.buffer).setUint16(cdOff + 8, 0x0801, true); // бит шифрования
  const z = await openZip(new Blob([enc]));
  await assert.rejects(z.read(z.entries[0] as ZipEntry, 100), /паролем/);

  const odd = bytes.slice();
  new DataView(odd.buffer).setUint16(cdOff + 10, 14, true); // LZMA
  const z2 = await openZip(new Blob([odd]));
  await assert.rejects(z2.read(z2.entries[0] as ZipEntry, 100), /сжатия/);
});
