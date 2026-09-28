#!/usr/bin/env sh
set -eu

# Resolve paths relative to script location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_FILE="${REPO_ROOT}/frontend/nginx/cloudflare-real-ip.conf"
TEMP_FILE="${TARGET_FILE}.tmp"

mkdir -p "$(dirname "${TARGET_FILE}")"

echo "Fetching authoritative Cloudflare IP ranges..."
IPV4=$(curl -sSL --fail https://www.cloudflare.com/ips-v4 || true)
IPV6=$(curl -sSL --fail https://www.cloudflare.com/ips-v6 || true)

if [ -z "${IPV4}" ]; then
  echo "Error: Failed to fetch Cloudflare IPv4 ranges or response was empty." >&2
  exit 1
fi

if [ -z "${IPV6}" ]; then
  echo "Error: Failed to fetch Cloudflare IPv6 ranges or response was empty." >&2
  exit 1
fi

DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

cat <<EOF > "${TEMP_FILE}"
# Cloudflare published IP ranges for ngx_http_realip_module
# Generated on: ${DATE}
# Sources:
#   - https://www.cloudflare.com/ips-v4
#   - https://www.cloudflare.com/ips-v6
#
# Regenerate with: scripts/update-cloudflare-ips.sh

# IPv4
EOF

for cidr in ${IPV4}; do
  echo "set_real_ip_from ${cidr};" >> "${TEMP_FILE}"
done

cat <<EOF >> "${TEMP_FILE}"

# IPv6
EOF

for cidr in ${IPV6}; do
  echo "set_real_ip_from ${cidr};" >> "${TEMP_FILE}"
done

cat <<EOF >> "${TEMP_FILE}"

# Trust CF-Connecting-IP header only from the above Cloudflare IP ranges
real_ip_header CF-Connecting-IP;
EOF

mv "${TEMP_FILE}" "${TARGET_FILE}"
echo "Successfully generated ${TARGET_FILE}"
