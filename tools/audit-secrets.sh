#!/usr/bin/env bash
#
# Auditoria de segredos e exposição do repositório.
#
#   tools/audit-secrets.sh                 árvore de trabalho (versionado + não versionado)
#   tools/audit-secrets.sh --staged        apenas o índice (usado pelo hook de pre-commit)
#   tools/audit-secrets.sh --history       todos os blobs de todos os commits
#   tools/audit-secrets.sh --all           tudo acima
#   tools/audit-secrets.sh --known FILE    confere se algum segredo literal de FILE vazou
#                                          (um por linha; o valor nunca é impresso)
#   tools/audit-secrets.sh --strict        avisos também fazem falhar
#
# Saída: 0 limpo · 1 achados · 2 a própria auditoria não pôde ser confiada
#
# Princípio de projeto: uma varredura que não varreu nada NÃO é uma varredura limpa.
# Se o autoteste falhar, ou se o conjunto de arquivos vier vazio onde deveria haver
# arquivos, o script sai com código 2 em vez de dizer "nenhum problema encontrado".

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "erro: execute dentro de um repositório git" >&2; exit 2; }

ESCOPO_ARVORE=1 ESCOPO_INDICE=0 ESCOPO_HISTORICO=0 ESTRITO=0 ARQUIVO_CONHECIDOS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --staged)  ESCOPO_ARVORE=0; ESCOPO_INDICE=1 ;;
    --history) ESCOPO_HISTORICO=1 ;;
    --all)     ESCOPO_ARVORE=1; ESCOPO_INDICE=1; ESCOPO_HISTORICO=1 ;;
    --known)   shift; ARQUIVO_CONHECIDOS="${1:-}" ;;
    --strict)  ESTRITO=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "erro: opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── cores só quando há terminal ──────────────────────────────────────────────
if [ -t 1 ]; then R=$'\033[31m'; Y=$'\033[33m'; G=$'\033[32m'; B=$'\033[1m'; Z=$'\033[0m'
else R=""; Y=""; G=""; B=""; Z=""; fi

N_ERROS=0 N_AVISOS=0 N_ARQUIVOS_VISTOS=0

erro()  { N_ERROS=$((N_ERROS+1));   printf "%s  ERRO  %s%s\n" "$R" "$*" "$Z"; }
aviso() { N_AVISOS=$((N_AVISOS+1)); printf "%s  aviso %s%s\n" "$Y" "$*" "$Z"; }
secao() { printf "\n%s▸ %s%s\n" "$B" "$*" "$Z"; }

# ── padrões ──────────────────────────────────────────────────────────────────
# Cada regex começa com um metacaractere logo após o prefixo literal, então o
# próprio arquivo de padrões não casa consigo mesmo — o script pode se auditar.
PADROES_ERRO=(
  "token-github|gh[pousr]_[A-Za-z0-9]{36}"
  "token-github-fine-grained|github_pat_[A-Za-z0-9_]{40,}"
  "chave-aws|AKIA[0-9A-Z]{16}"
  "chave-privada|-----BEGIN [A-Z ]*PRIVATE KEY-----"
  "token-slack|xox[abprs]-[A-Za-z0-9]{8,}"
  "chave-google|AIza[0-9A-Za-z_-]{35}"
  "token-anthropic|sk-ant-[A-Za-z0-9_-]{24,}"
  "token-openai|sk-(proj-[A-Za-z0-9_-]{32,}|[A-Za-z0-9]{32,})"
  "credencial-em-url|[a-z][a-z0-9+.-]*://[^/[:space:]:@\"']+:[^/[:space:]:@\"']+@"
  "cabecalho-de-autorizacao|[Aa]uthorization[[:space:]]*:[[:space:]]*([Bb]asic|[Bb]earer)[[:space:]]+[A-Za-z0-9._~+/=-]{16,}"
  "certificado-ou-chave|-----BEGIN (CERTIFICATE|OPENSSH PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----"
  "conexao-com-credencial|(postgres|postgresql|mysql|mongodb|mongodb\\+srv|redis|amqp|ftp|ssh)://[^/[:space:]:@\"']+:[^/[:space:]:@\"']+@"
)
PADROES_AVISO=(
  "segredo-atribuido|(password|passwd|senha|secret|token|api_key|apikey|access_key)[[:space:]]*[=:][[:space:]]*[\"'][^\"']{12,}[\"']"
  "jwt|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\."
  "caminho-pessoal|/(home|Users)/[a-z][a-z0-9_-]{1,}/"
)

# Amostras sintéticas para o autoteste. Concatenadas em runtime para que o
# literal no arquivo não seja um segredo nem dispare a própria varredura.
amostras_autoteste() {
  echo "token-github|gh""p_0123456789abcdefghijklmnopqrstuvwxyz"
  echo "token-github-fine-grained|github""_pat_$(printf 'A%.0s' $(seq 1 45))"
  echo "chave-aws|AKI""A0123456789ABCDEF"
  echo "chave-privada|-----BEG""IN RSA PRIVATE KEY-----"
  echo "token-slack|xo""xb-012345678901"
  echo "chave-google|AIz""a01234567890123456789012345678901234"
  echo "token-anthropic|sk-""ant-0123456789012345678901234567"
  echo "token-openai|s""k-abc123ABC456def789GHI012jkl345MNO"
  echo "credencial-em-url|https://usuario:senha123@exemplo.com/repo.git"
  echo "cabecalho-de-autorizacao|Authorization: Bear""er abcdefghijklmnopqrstuvwxyz012345"
  echo "certificado-ou-chave|-----BEG""IN CERTIFICATE-----"
  echo "conexao-com-credencial|postgres://app:s3nh4@db.interno:5432/producao"
}

ARQUIVOS_IGNORADOS=(
  ":(exclude)tools/audit-secrets.sh"
  ":(exclude)_site"
)

# ── autoteste: a auditoria detecta o que promete detectar? ───────────────────
secao "Autoteste dos padrões"
FALHAS_AUTOTESTE=0
while IFS='|' read -r nome amostra; do
  regex=""
  for p in "${PADROES_ERRO[@]}"; do
    [ "${p%%|*}" = "$nome" ] && regex="${p#*|}"
  done
  if [ -z "$regex" ]; then
    echo "  ${R}padrão '$nome' sumiu da lista${Z}"; FALHAS_AUTOTESTE=$((FALHAS_AUTOTESTE+1)); continue
  fi
  if printf '%s\n' "$amostra" | grep -qE -e "$regex"; then
    printf "  %s✓%s %s\n" "$G" "$Z" "$nome"
  else
    printf "  %s✗ %s não detecta a própria amostra%s\n" "$R" "$nome" "$Z"
    FALHAS_AUTOTESTE=$((FALHAS_AUTOTESTE+1))
  fi
done < <(amostras_autoteste)

# padrão sem amostra passa despercebido pelo laço acima — checar explicitamente
N_PADROES=${#PADROES_ERRO[@]}
N_AMOSTRAS=$(amostras_autoteste | wc -l)
if [ "$N_PADROES" -ne "$N_AMOSTRAS" ]; then
  printf "  %s✗ %s padrão(ões) de erro mas %s amostra(s): algum padrão não é testado%s\n" \
    "$R" "$N_PADROES" "$N_AMOSTRAS" "$Z"
  FALHAS_AUTOTESTE=$((FALHAS_AUTOTESTE + 1))
else
  printf "  %s✓%s cobertura: %s padrões, %s amostras\n" "$G" "$Z" "$N_PADROES" "$N_AMOSTRAS"
fi

if [ "$FALHAS_AUTOTESTE" -gt 0 ]; then
  echo
  echo "${R}${B}AUDITORIA NÃO CONFIÁVEL: $FALHAS_AUTOTESTE padrão(ões) não detectam nem a amostra sintética.${Z}"
  echo "Nenhum resultado abaixo teria valor. Corrija os padrões antes de confiar neste script."
  exit 2
fi

# ── varredura de conteúdo ────────────────────────────────────────────────────
varre() {   # $1 = rótulo do escopo, $2 = flag do git grep
  local rotulo="$1" flag="$2" achou_algo=0
  for entrada in "${PADROES_ERRO[@]}"; do
    local nome="${entrada%%|*}" regex="${entrada#*|}"
    local saida
    saida=$(git grep --no-color -nIE $flag -e "$regex" -- "${ARQUIVOS_IGNORADOS[@]}" 2>/dev/null)
    if [ -n "$saida" ]; then
      while IFS= read -r linha; do
        erro "[$nome] $rotulo: ${linha:0:160}"
      done <<< "$saida"
      achou_algo=1
    fi
  done
  for entrada in "${PADROES_AVISO[@]}"; do
    local nome="${entrada%%|*}" regex="${entrada#*|}"
    local saida
    saida=$(git grep --no-color -nIE $flag -e "$regex" -- "${ARQUIVOS_IGNORADOS[@]}" 2>/dev/null)
    if [ -n "$saida" ]; then
      while IFS= read -r linha; do
        aviso "[$nome] $rotulo: ${linha:0:160}"
      done <<< "$saida"
    fi
  done
  return $achou_algo
}

if [ "$ESCOPO_ARVORE" = 1 ]; then
  secao "Árvore de trabalho"
  n=$(git ls-files | wc -l)
  N_ARQUIVOS_VISTOS=$((N_ARQUIVOS_VISTOS + n))
  if [ "$n" -eq 0 ]; then
    echo "${R}nenhum arquivo versionado encontrado — varredura sem valor${Z}"; exit 2
  fi
  echo "  $n arquivo(s) versionado(s) + não versionados"
  varre "árvore" "--untracked"
fi

if [ "$ESCOPO_INDICE" = 1 ]; then
  secao "Índice (o que seria commitado)"
  n=$(git diff --cached --name-only | wc -l)
  echo "  $n arquivo(s) no índice"
  if [ "$n" -gt 0 ]; then
    N_ARQUIVOS_VISTOS=$((N_ARQUIVOS_VISTOS + n))
    varre "índice" "--cached"
  fi
fi

if [ "$ESCOPO_HISTORICO" = 1 ]; then
  secao "Histórico completo (todos os blobs de todos os commits)"
  mapa=$(mktemp); blobs=$(mktemp)
  trap 'rm -f "$mapa" "$blobs"' EXIT
  git rev-list --objects --all > "$mapa" 2>/dev/null
  awk 'NF>1 {print $1}' "$mapa" | sort -u > "$blobs"
  n_blobs=$(wc -l < "$blobs")
  n_commits=$(git rev-list --all --count)
  echo "  $n_commits commit(s), $n_blobs blob(s) com caminho"
  if [ "$n_blobs" -eq 0 ]; then
    echo "${R}enumeração de blobs voltou vazia — varredura sem valor${Z}"; exit 2
  fi
  N_ARQUIVOS_VISTOS=$((N_ARQUIVOS_VISTOS + n_blobs))
  n_lidos=0 n_arvores=0 n_falha_leitura=0 n_binarios=0
  while read -r oid; do
    tipo=$(git cat-file -t "$oid" 2>/dev/null)
    if [ "$tipo" != "blob" ]; then n_arvores=$((n_arvores+1)); continue; fi   # diretório
    caminho=$(grep -m1 "^$oid " "$mapa" | cut -d' ' -f2-)
    [ "$caminho" = "tools/audit-secrets.sh" ] && continue
    nulos=$(git cat-file blob "$oid" 2>/dev/null | head -c 8000 | tr -dc '\000' | wc -c)
    if [ "${nulos:-0}" -gt 0 ]; then
      n_binarios=$((n_binarios+1)); continue      # binário: não é lido como texto
    fi
    conteudo=$(git cat-file blob "$oid" 2>/dev/null) || { n_falha_leitura=$((n_falha_leitura+1)); continue; }
    n_lidos=$((n_lidos+1))
    for entrada in "${PADROES_ERRO[@]}"; do
      nome="${entrada%%|*}"; regex="${entrada#*|}"
      if printf '%s' "$conteudo" | grep -qE -e "$regex"; then
        erro "[$nome] histórico: blob ${oid:0:8} em '$caminho'"
      fi
    done
  done < "$blobs"
  echo "  $n_lidos blob(s) de texto lidos, $n_arvores diretório(s) e $n_binarios binário(s) ignorado(s)"
  if [ "$n_falha_leitura" -gt 0 ]; then
    erro "$n_falha_leitura blob(s) não puderam ser lidos — o histórico NÃO foi auditado por inteiro"
  fi
  # falha alta: se quase nada pôde ser lido, o resultado não vale
  if [ "$n_lidos" -eq 0 ]; then
    echo "${R}nenhum blob pôde ser lido — varredura sem valor${Z}"; exit 2
  fi
fi

# ── arquivos que não deveriam estar versionados ──────────────────────────────
secao "Arquivos sensíveis versionados"
PROIBIDOS='(^|/)(\.env($|\.)|.*\.pem$|.*\.p12$|.*\.pfx$|.*\.keystore$|.*\.jks$|id_rsa|id_dsa|id_ecdsa|id_ed25519|\.netrc|\.npmrc|\.pypirc|\.htpasswd|credentials\.json|service-account.*\.json|secrets?\.ya?ml)'
encontrados=$(git ls-files | grep -iE -e "$PROIBIDOS" || true)
if [ -n "$encontrados" ]; then
  while IFS= read -r f; do erro "arquivo sensível versionado: $f"; done <<< "$encontrados"
else
  echo "  nenhum versionado"
fi
# ainda não versionado, mas presente: avisa antes que um `git add .` o pegue
nao_versionados=$(git ls-files --others --exclude-standard | grep -iE -e "$PROIBIDOS" || true)
if [ -n "$nao_versionados" ]; then
  while IFS= read -r f; do
    aviso "arquivo sensível no diretório (ainda não versionado): $f"
  done <<< "$nao_versionados"
fi
if git ls-files | grep -qE '^_site/'; then
  aviso "_site/ está versionado — é saída de build, deveria estar no .gitignore"
fi

# ── configuração local (não vai para o GitHub, mas vaza daqui) ───────────────
secao "Configuração local do git"
for remoto in $(git remote 2>/dev/null); do
  url=$(git remote get-url "$remoto" 2>/dev/null)
  if printf '%s' "$url" | grep -qE '://[^/[:space:]]+:[^/[:space:]]+@|://gh[pousr]_|://github_pat_'; then
    erro "remote '$remoto' tem credencial embutida na URL (fica em texto puro em .git/config)"
  else
    echo "  remote '$remoto': sem credencial na URL"
  fi
done
if git config --get credential.helper 2>/dev/null | grep -qx 'store'; then
  aviso "credential.helper=store guarda tokens em texto puro em ~/.git-credentials"
fi

# ── exposição de identidade (repositório é público) ─────────────────────────
secao "Identidade exposta nos commits"
emails=$(git log --all --format='%ae%n%ce' 2>/dev/null | sort -u | grep -v '^$' || true)
if [ -n "$emails" ]; then
  while IFS= read -r e; do
    if printf '%s' "$e" | grep -q 'users.noreply.github.com$'; then
      echo "  $e (protegido)"
    else
      aviso "e-mail visível publicamente em todo commit: $e"
    fi
  done <<< "$emails"
fi

# ── segredos conhecidos desta máquina ───────────────────────────────────────
if [ -n "$ARQUIVO_CONHECIDOS" ]; then
  secao "Segredos conhecidos (conferência literal)"
  if [ ! -r "$ARQUIVO_CONHECIDOS" ]; then
    echo "${R}não consegui ler '$ARQUIVO_CONHECIDOS'${Z}"; exit 2
  fi
  n_segredos=0
  while IFS= read -r segredo; do
    [ ${#segredo} -lt 12 ] && continue
    n_segredos=$((n_segredos+1))
    if git grep -qIF --untracked -e "$segredo" -- "${ARQUIVOS_IGNORADOS[@]}" 2>/dev/null; then
      erro "segredo conhecido (${segredo:0:4}…) aparece na árvore de trabalho"
    fi
    if [ "$ESCOPO_HISTORICO" = 1 ] && git log --all -S"$segredo" --oneline 2>/dev/null | grep -q .; then
      erro "segredo conhecido (${segredo:0:4}…) aparece no histórico de commits"
    fi
  done < "$ARQUIVO_CONHECIDOS"
  if [ "$n_segredos" -eq 0 ]; then
    echo "${R}arquivo de segredos não tinha nenhuma linha utilizável — conferência sem valor${Z}"; exit 2
  fi
  echo "  $n_segredos segredo(s) conferido(s)"
fi

# ── veredito ─────────────────────────────────────────────────────────────────
printf "\n%s%s%s\n" "$B" "──────────────────────────────────────────────" "$Z"
echo "  arquivos versionados/blobs inspecionados: $N_ARQUIVOS_VISTOS"
echo "  erros: $N_ERROS    avisos: $N_AVISOS"

if [ "$N_ERROS" -gt 0 ]; then
  printf "%s%sREPROVADO — resolva os erros antes de publicar.%s\n" "$R" "$B" "$Z"
  exit 1
fi
if [ "$N_AVISOS" -gt 0 ] && [ "$ESTRITO" = 1 ]; then
  printf "%s%sREPROVADO (--strict) — há avisos.%s\n" "$Y" "$B" "$Z"
  exit 1
fi
printf "%s%sAPROVADO%s%s\n" "$G" "$B" "$Z" "$([ "$N_AVISOS" -gt 0 ] && echo " — com $N_AVISOS aviso(s) para revisar")"
exit 0
