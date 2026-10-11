// Builds a tiny valid ONNX model by hand (no dependencies): c = Add(a, b) for float tensors of shape [1, 3].
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const varint = (n) => {
  const out = []
  let v = BigInt(n)
  while (v > 0x7fn) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n }
  out.push(Number(v))
  return Buffer.from(out)
}
const tag = (field, wire) => varint((field << 3) | wire)
const lenDelim = (field, buf) => Buffer.concat([tag(field, 2), varint(buf.length), buf])
const str = (field, s) => lenDelim(field, Buffer.from(s, 'utf8'))
const int = (field, n) => Buffer.concat([tag(field, 0), varint(n)])

const dim = (n) => lenDelim(1, int(1, n)) // TensorShapeProto.dim { dim_value }
const shape = (dims) => lenDelim(2, Buffer.concat(dims.map(dim))) // Tensor.shape
const tensorType = (elem, dims) => lenDelim(1, Buffer.concat([int(1, elem), shape(dims)])) // TypeProto.tensor_type
const valueInfo = (name, elem, dims) => Buffer.concat([str(1, name), lenDelim(2, tensorType(elem, dims))])

export function buildModel() {
  const node = Buffer.concat([str(1, 'a'), str(1, 'b'), str(2, 'c'), str(3, 'add'), str(4, 'Add')])
  const graph = Buffer.concat([
    lenDelim(1, node),
    str(2, 'spike'),
    lenDelim(11, valueInfo('a', 1, [1, 3])),
    lenDelim(11, valueInfo('b', 1, [1, 3])),
    lenDelim(12, valueInfo('c', 1, [1, 3])),
  ])
  return Buffer.concat([int(1, 8), str(2, 'quorum-csp-spike'), lenDelim(7, graph), lenDelim(8, int(2, 13))])
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const model = buildModel()
  writeFileSync(fileURLToPath(new URL('./tiny-add.onnx', import.meta.url)), model)
  console.log('tiny-add.onnx', model.length, 'bytes')
}
