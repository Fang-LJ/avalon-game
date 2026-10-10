#!/usr/bin/env bash
# Uses only the existing MinIO container; secrets never leave its environment.
set -euo pipefail
: "${SSH_HOST:?Set SSH_HOST to the verified production SSH target}"
: "${SSH_IDENTITY:?Set SSH_IDENTITY to the existing SSH key path}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SSH=(ssh -i "$SSH_IDENTITY" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "$SSH_HOST")
remote_dir=$("${SSH[@]}" 'mktemp -d /tmp/avalon-assets.XXXXXXXX')
[[ "$remote_dir" == /tmp/avalon-assets.* ]] || exit 1
scp -q -i "$SSH_IDENTITY" -o BatchMode=yes -o StrictHostKeyChecking=yes -r \
  "$ROOT/static-assets/avalon/cards/v1" "$ROOT/scripts/publish-card-assets-container.sh" \
  "$ROOT/static-assets/avalon/public-policy.json" "$SSH_HOST:$remote_dir/"
"${SSH[@]}" "sudo docker cp '$remote_dir' playmate-minio:'$remote_dir'; sudo docker exec playmate-minio sh '$remote_dir/publish-card-assets-container.sh' '$remote_dir'"
# Retain staging on failure for diagnosis. Only these generated temporary paths are removed.
"${SSH[@]}" "sudo docker exec playmate-minio rm -rf '$remote_dir'; rm -rf '$remote_dir'"
