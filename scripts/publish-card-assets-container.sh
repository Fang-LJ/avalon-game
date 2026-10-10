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
set -- "$stage"/v2/*/*.png
count=$#
[ "$count" -eq 19 ] || { echo 'Expected exactly 19 cards' >&2; exit 1; }
mc stat cards/avalon-assets >/dev/null
original=$(mc anonymous get-json cards/avalon-assets)
# Refuse to overwrite any unrecognized policy. The only authorized change is v2 GetObject.
v1_policy='{"Statement":[{"Action":["s3:GetObject"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::avalon-assets/cards/v1/*"]}],"Version":"2012-10-17"}'
v2_policy='{"Statement":[{"Action":["s3:GetObject"],"Effect":"Allow","Principal":{"AWS":["*"]},"Resource":["arn:aws:s3:::avalon-assets/cards/v1/*","arn:aws:s3:::avalon-assets/cards/v2/*"]}],"Version":"2012-10-17"}'
[ "$original" = "$v1_policy" ] || [ "$original" = "$v2_policy" ] || { echo 'Unexpected bucket policy; refusing to replace it' >&2; exit 1; }
printf '%s\n' "$original" > "$stage/original-policy.json"
: > "$stage/v1-before.sha256"
# Read and fingerprint all v1 objects, never write or delete any of them.
for file in "$stage"/v2/*/*.png; do
  relative=${file#"$stage/v2/"}
  v1_relative=${relative%.png}.jpg
  mc cat "cards/avalon-assets/cards/v1/$v1_relative" > "$stage/existing.bin"
  digest=$(sha256sum "$stage/existing.bin")
  printf '%s  %s\n' "${digest%% *}" "$v1_relative" >> "$stage/v1-before.sha256"
done
# Preflight every immutable v2 object before writing any.
for file in "$stage"/v2/*/*.png; do
  relative=${file#"$stage/v2/"}
  target="cards/avalon-assets/cards/v2/$relative"
  if mc stat "$target" >/dev/null 2>&1; then
    mc cat "$target" > "$stage/existing.bin"
    local_hash=$(sha256sum "$file"); remote_hash=$(sha256sum "$stage/existing.bin")
    [ "${local_hash%% *}" = "${remote_hash%% *}" ] || { echo "Immutable collision: $relative" >&2; exit 1; }
  fi
done
for file in "$stage"/v2/*/*.png; do
  relative=${file#"$stage/v2/"}
  target="cards/avalon-assets/cards/v2/$relative"
  if ! mc stat "$target" >/dev/null 2>&1; then
    mc cp --attr 'Content-Type=image/png;Cache-Control=public,max-age=31536000,immutable' "$file" "$target" >/dev/null
  fi
  mc cat "$target" > "$stage/existing.bin"
  local_hash=$(sha256sum "$file"); remote_hash=$(sha256sum "$stage/existing.bin")
  [ "${local_hash%% *}" = "${remote_hash%% *}" ] || { echo "Upload mismatch: $relative" >&2; exit 1; }
  echo "Verified: cards/v2/$relative"
done
: > "$stage/v1-after.sha256"
for file in "$stage"/v2/*/*.png; do
  relative=${file#"$stage/v2/"}
  v1_relative=${relative%.png}.jpg
  mc cat "cards/avalon-assets/cards/v1/$v1_relative" > "$stage/existing.bin"
  digest=$(sha256sum "$stage/existing.bin")
  printf '%s  %s\n' "${digest%% *}" "$v1_relative" >> "$stage/v1-after.sha256"
done
before_hash=$(sha256sum "$stage/v1-before.sha256"); after_hash=$(sha256sum "$stage/v1-after.sha256")
[ "${before_hash%% *}" = "${after_hash%% *}" ] || { echo 'v1 integrity changed; refusing policy update' >&2; exit 1; }
mc anonymous set-json "$stage/public-policy.json" cards/avalon-assets >/dev/null
updated=$(mc anonymous get-json cards/avalon-assets)
[ "$updated" = "$v2_policy" ] || { echo 'Policy verification failed; restore original-policy.json' >&2; exit 1; }
echo '19 v2 PNG cards published; v1 unchanged; anonymous GetObject only, no ListBucket or writes.'
