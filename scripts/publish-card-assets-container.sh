#!/bin/sh
set -eu
stage=$1
case "$stage" in /tmp/avalon-assets.*) ;; *) exit 1 ;; esac
[ -n "${MINIO_ROOT_USER:-}" ] && [ -n "${MINIO_ROOT_PASSWORD:-}" ]
MC_CONFIG_DIR=$(mktemp -d /tmp/avalon-mc.XXXXXXXX)
export MC_CONFIG_DIR
trap 'rm -rf "$MC_CONFIG_DIR"' EXIT
mc alias set cards http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --api S3v4 --path on >/dev/null 2>&1 || {
  echo 'MinIO authentication failed' >&2; exit 1;
}
set -- "$stage"/v1/*/*.jpg
count=$#
[ "$count" -eq 19 ] || { echo 'Expected exactly 19 cards' >&2; exit 1; }
mc mb --ignore-existing cards/avalon-assets >/dev/null
mc stat cards/avalon-assets >/dev/null
# Preflight every immutable object before writing any: differing v1 bytes abort publication.
for file in "$stage"/v1/*/*.jpg; do
  relative=${file#"$stage/v1/"}
  target="cards/avalon-assets/cards/v1/$relative"
  if mc stat "$target" >/dev/null 2>&1; then
    mc cat "$target" > "$stage/existing.jpg"
    local_hash=$(sha256sum "$file"); remote_hash=$(sha256sum "$stage/existing.jpg")
    [ "${local_hash%% *}" = "${remote_hash%% *}" ] || { echo "Immutable collision: $relative" >&2; exit 1; }
  fi
done
for file in "$stage"/v1/*/*.jpg; do
  relative=${file#"$stage/v1/"}
  target="cards/avalon-assets/cards/v1/$relative"
  if ! mc stat "$target" >/dev/null 2>&1; then
    mc cp --attr 'Content-Type=image/jpeg;Cache-Control=public,max-age=31536000,immutable' "$file" "$target" >/dev/null
  fi
  echo "Verified: cards/v1/$relative"
done
mc anonymous set-json "$stage/public-policy.json" cards/avalon-assets >/dev/null
echo '19 cards published; anonymous permission is GetObject only.'
