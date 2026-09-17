#!/usr/bin/env bash
# Confere a caixa de ferramentas de /ferramentas/.
#
# Duas checagens, e as duas existem por defeito que já aconteceu:
#
#  1. Todo <script src> referenciado pela página existe. Script quebrado NÃO dá
#     erro visível: a ferramenta simplesmente não faz nada, e só o console conta.
#
#  2. As funções de hash e dígito verificador batem com referências externas.
#     Em 17/09/2026 dois defeitos passariam sem isto: o MD5 emitia cada palavra
#     de 32 bits em big-endian (o digest é little-endian, RFC 1321) e o
#     validateEAN13 usava Luhn, que é outro algoritmo — aceitava código
#     inválido e recusava válido.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

PAGINA=ferramentas.html
DIR_JS=assets/js/ferramentas
falhas=0

echo "▸ Módulos referenciados pela página"
refs=$(grep -o 'src="/assets/js/ferramentas/[^"]*"' "$PAGINA" | sed 's|.*/||; s|"||')
n=0
for j in $refs; do
  n=$((n+1))
  if [ ! -f "$DIR_JS/$j" ]; then echo "  ✗ FALTA $j"; falhas=$((falhas+1)); fi
done
[ "$n" -eq 0 ] && { echo "  ✗ nenhum <script src> encontrado — a página mudou de forma?"; falhas=$((falhas+1)); }
echo "  $n módulo(s) referenciado(s), $(ls "$DIR_JS" | wc -l) presente(s) em $DIR_JS"

echo
echo "▸ Ferramentas na grade"
echo "  $(grep -c 'onclick="openTool(' "$PAGINA") cartão(ões)"

echo
echo "▸ Hash e dígito verificador contra referência externa"
node -e '
const fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
global.TextEncoder=require("util").TextEncoder;
const src=fs.readFileSync("assets/js/ferramentas/crypto-utils.js","utf8");
const [H,C,B]=new Function(src+"; return [HashUtils,ChecksumUtils,Base64Utils];")();
let f=0;
const eq=(n,g,e)=>{const ok=String(g).toLowerCase()===String(e).toLowerCase();
  if(!ok){f++;console.log("  ✗ "+n+": "+g+" (esperado "+e+")");}};
for(const s of ["","abc","o blog do franz kurt","acentuação çãõ","a".repeat(200)])
  eq("md5",H.md5(s),crypto.createHash("md5").update(s,"utf8").digest("hex"));
eq("crc32",C.crc32("abc"),(zlib.crc32("abc")>>>0).toString(16).padStart(8,"0"));
eq("adler32",C.adler32("abc"),"024D0127");
eq("fletcher16",C.fletcher16("abcde"),"C8F0");
eq("EAN13 válido",C.validateEAN13("4006381333931"),true);
eq("EAN13 inválido",C.validateEAN13("4006381333932"),false);
eq("ISBN13 válido",C.validateISBN13("9780306406157"),true);
eq("ISBN10 válido",C.validateISBN10("0306406152"),true);
eq("luhn válido",C.luhn("4539578763621486"),true);
eq("luhn inválido",C.luhn("4539578763621487"),false);
eq("base64",B.encode("abc"),"YWJj");
console.log(f===0 ? "  16 verificações, todas conferem" : "  "+f+" divergência(s)");
process.exit(f?1:0);
' || falhas=$((falhas+1))

echo
echo "──────────────────────────────────────────────"
if [ "$falhas" -eq 0 ]; then echo "APROVADO"; exit 0; fi
echo "REPROVADO — $falhas problema(s)"; exit 1
