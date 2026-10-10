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
  "$ROOT/static-assets/avalon/cards/v2" "$ROOT/scripts/publish-card-assets-container.sh" \
  "$ROOT/static-assets/avalon/public-policy.json" "$SSH_HOST:$remote_dir/"
"${SSH[@]}" "sudo docker cp '$remote_dir' playmate-minio:'$remote_dir'; sudo docker exec playmate-minio sh '$remote_dir/publish-card-assets-container.sh' '$remote_dir'"
# Preserve the exact prior bucket policy and v1 checksums outside disposable staging.
backup_dir=$("${SSH[@]}" 'sudo mkdir -p /opt/avalon-game/static-assets-backups; sudo mktemp -d /opt/avalon-game/static-assets-backups/cards-v2.XXXXXXXX')
[[ "$backup_dir" == /opt/avalon-game/static-assets-backups/cards-v2.* ]] || exit 1
"${SSH[@]}" "sudo docker cp playmate-minio:'$remote_dir/original-policy.json' '$backup_dir/original-policy.json'; sudo docker cp playmate-minio:'$remote_dir/v1-before.sha256' '$backup_dir/v1-before.sha256'; sudo docker cp playmate-minio:'$remote_dir/v1-after.sha256' '$backup_dir/v1-after.sha256'"
echo "Policy/v1 integrity backup: $backup_dir"
# Retain staging on failure for diagnosis. Only these generated temporary paths are removed.
"${SSH[@]}" "sudo docker exec playmate-minio rm -rf '$remote_dir'; rm -rf '$remote_dir'"
