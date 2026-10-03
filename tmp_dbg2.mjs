import fs from "node:fs"
import zlib from "node:zlib"

const file =
  "d:/EMS-GrandPrix/documentos/documento_de_implementacao/ENERGYMATRIX_Documento_Tecnico_Consolidado_v2_Arquitetura_2026.pdf"
const buf = fs.readFileSync(file)
const raw = buf.toString("latin1")

const lines = []
let idx = -1
while ((idx = raw.indexOf("stream", idx + 1)) !== -1) {
  const before = raw.slice(Math.max(0, idx - 120), idx).replace(/\n/g, " | ")
  lines.push(`@${idx} :: ...${before}`)
}
fs.writeFileSync("tmp_dbg2.txt", lines.join("\n"), "utf8")

// Also try: iterate objects with /Length
const objRe = /(\d+) 0 obj\s*<<([\s\S]{0,400}?)>>\s*stream\r?\n/g
let m
const info = []
while ((m = objRe.exec(raw))) {
  info.push(`obj ${m[1]}: ${m[2].replace(/\s+/g, " ").slice(0, 200)}`)
}
fs.writeFileSync("tmp_dbg3.txt", info.join("\n"), "utf8")
console.log("streams found:", lines.length, "objs:", info.length)