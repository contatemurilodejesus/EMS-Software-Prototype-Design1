import fs from "node:fs"
import zlib from "node:zlib"

const file =
  "d:/EMS-GrandPrix/documentos/documento_de_implementacao/ENERGYMATRIX_Documento_Tecnico_Consolidado_v2_Arquitetura_2026.pdf"
const buf = fs.readFileSync(file)
const raw = buf.toString("latin1")

const out = []
const re = /stream\r?\n/g
let m
while ((m = re.exec(raw))) {
  const start = m.index + m[0].length
  const end = raw.indexOf("endstream", start)
  if (end === -1) continue
  const chunk = Buffer.from(raw.slice(start, end), "latin1")
  try {
    out.push(zlib.inflateSync(chunk).toString("latin1"))
  } catch (e) {
    out.push("<<FAIL:" + e.message + ">>")
  }
}
console.log("total streams:", out.length)
out.forEach((s, i) => {
  console.log("--- stream", i, "len", s.length, "---")
  console.log(s.slice(0, 400).replace(/[^\x20-\x7e\n]/g, "."))
})