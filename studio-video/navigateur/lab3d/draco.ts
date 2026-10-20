// DRACO COMPRESSION of a .glb (KHR_draco_mesh_compression): glTF-Transform rewrites the file, Google's Draco encoder
// (WebAssembly, loaded once from jsDelivr) compresses every mesh. Null when the encoder cannot load (offline): the
// caller keeps the uncompressed .glb and says so.
const DRACO = 'https://cdn.jsdelivr.net/npm/draco3d@1.5.7/';
let encoder: Promise<unknown> | null = null;
function loadEncoder(): Promise<unknown> {
  encoder ??= (async () => {
    const [src, wasm] = await Promise.all([
      fetch(`${DRACO}draco_encoder_nodejs.js`).then((r) => r.text()),
      fetch(`${DRACO}draco_encoder.wasm`).then((r) => r.arrayBuffer()),
    ]);
    // The Emscripten build exports a factory through module.exports; the WebAssembly bytes are handed to it directly.
    const mod: { exports: unknown } = { exports: {} };
    new Function('module', 'exports', 'require', '__dirname', '__filename', src)(
      mod,
      mod.exports,
      () => ({}),
      '',
      '',
    );
    const factory = mod.exports as (o: { wasmBinary: Uint8Array }) => Promise<unknown>;
    return await factory({ wasmBinary: new Uint8Array(wasm) });
  })().catch((e) => {
    encoder = null;
    throw e;
  });
  return encoder;
}
export async function dracoCompress(
  glb: Uint8Array,
): Promise<{ bytes: Uint8Array; before: number; after: number } | null> {
  try {
    const [{ WebIO }, { KHRDracoMeshCompression }, enc] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      loadEncoder(),
    ]);
    const io = new WebIO()
      .registerExtensions([KHRDracoMeshCompression])
      .registerDependencies({ 'draco3d.encoder': enc });
    const doc = await io.readBinary(glb);
    // Draco needs indexed triangles: a primitive without indices gets the trivial 0…n-1 list.
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute('POSITION');
        if (!p.getIndices() && pos) {
          const n = pos.getCount();
          const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
          for (let i = 0; i < n; i++) idx[i] = i;
          p.setIndices(
            doc
              .createAccessor()
              .setType('SCALAR')
              .setArray(idx)
              .setBuffer(doc.getRoot().listBuffers()[0] ?? doc.createBuffer()),
          );
        }
      }
    doc
      .createExtension(KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({
        method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
        encodeSpeed: 5,
        decodeSpeed: 5,
      });
    const bytes = await io.writeBinary(doc);
    return { bytes, before: glb.byteLength, after: bytes.byteLength };
  } catch (e) {
    (globalThis as { __dracoError?: string }).__dracoError = String((e as Error)?.stack ?? e);
    return null;
  }
}
