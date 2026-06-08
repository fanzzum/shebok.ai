#!/usr/bin/env bash
# Safe .env.local loader (handles special chars in JWT/tokens)
load_env_local() {
  local file="${1:-.env.local}"
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    export "$key=$val"
  done < "$file"
}
