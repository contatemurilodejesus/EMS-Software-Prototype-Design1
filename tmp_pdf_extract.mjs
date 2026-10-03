import fs from "node:fs"
import zlib from "node:zlib"

const file =
  process.argv[2] ||
  "d:/EMS-GrandPrix/documentos/documento_de_implementacao/ENERGYMATRIX_Documento_Tecnico_Consolidado_v2_Arquitetura_2026.pdf"

const buf = fs.readFileSync(file)
const raw = buf.toString("latin1")

function ascii85Decode(str) {
  // strip whitespace, remove <~ ~> markers
  let s = str.replace(/\s+/g, "")
  if (s.startsWith("<~")) s = s.slice(2)
  const eod = s.indexOf("~>")
  if (eod !== -1) s = s.slice(0, eod)
  const bytes = []
  let tuple = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "z" && tuple.length === 0) {
      bytes.push(0, 0, 0, 0)
      continue
    }
    const code = s.charCodeAt(i) - 33
    if (code < 0 || code > 84) continue
    tuple.push(code)
    if (tuple.length === 5) {
      let n = 0
      for (const t of tuple) n = n * 85 + t
      bytes.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff)
      tuple = []
    }
  }
  if (tuple.length > 0) {
    const pad = 5 - tuple.length
    for (let i = 0; i < pad; i++) tuple.push(84)
    let n = 0
    for (const t of tuple) n = n * 85 + t
    const full = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    for (let i = 0; i < 4 - pad; i++) bytes.push(full[i])
  }
  return Buffer.from(bytes)
}

// Collect all stream objects in file order, applying filters declared before them.
const out = []
const re = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g
let m
while ((m = re.exec(raw))) {
  const header = m[2]
  const start = m.index + m[0].length
  const end = raw.indexOf("endstream", start)
  if (end === -1) continue
  let chunk = Buffer.from(raw.slice(start, end), "latin1")
  const filters = header.match(/\/Filter\s*\[([^\]]*)\]/)
  const filterList = filters
    ? filters[1].split("/").map((f) => f.trim()).filter(Boolean)
    : []
  try {
    for (const f of filterList) {
      if (f === "ASCII85Decode") chunk = ascii85Decode(chunk.toString("latin1"))
      else if (f === "FlateDecode") chunk = zlib.inflateSync(chunk)
    }
    out.push({ obj: m[1], text: chunk.toString("latin1") })
  } catch (e) {
    out.push({ obj: m[1], text: "<<FAIL:" + e.message + ">>" })
  }
}

// Extract text from PDF content streams: strings inside parentheses within Tj/TJ ops.
function decodePdfString(s) {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => {
      switch (c) {
        case "n":
          return "\n"
        case "r":
          return "\r"
        case "t":
          return "\t"
        case "b":
          return "\b"
        case "f":
          return "\f"
        default:
          return c
      }
    })
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
}

let text = ""
for (const { obj, text: content } of out) {
  if (!/(Tj|TJ|Td|TD|T\*)/.test(content)) continue
  let page = ""
  const reShow = /\((?:\\.|[^\\()])*\)/g
  const lines = content.split("\n")
  for (const line of lines) {
    if (/Td|TD|T\*/.test(line)) page += "\n"
    const frags = []
    let sm
    reShow.lastIndex = 0
    while ((sm = reShow.exec(line))) {
      frags.push(decodePdfString(sm[0].slice(1, -1)))
    }
    if (frags.length) page += frags.join("")
    if (/Tj|TJ/.test(line)) page += " "
  }
  text += `\n\n=== OBJ ${obj} (PAGE) ===\n\n` + page
}

fs.writeFileSync(
  "d:/EMS-GrandPrix/sistema_estrutural/fase_teste/EMS Software Prototype Design1/tmp_doc.txt",
  text,
  "utf8",
)
console.log("streams:", out.length, "chars:", text.length)