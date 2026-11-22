#!/usr/bin/env bash
# Installe l'agent Wazuh sur la VM (hôte Debian) et l'enregistre auprès du manager.
# L'agent doit avoir la même version que le manager (deploy-wazuh.sh).
# Usage : sudo WAZUH_VERSION=4.14.10 WAZUH_MANAGER=127.0.0.1 bash wazuh/install-agent.sh
set -euo pipefail

WAZUH_VERSION="${WAZUH_VERSION:-4.14.10}"
WAZUH_MANAGER="${WAZUH_MANAGER:-127.0.0.1}"          # manager publié sur l'hôte par Docker
WAZUH_AGENT_NAME="${WAZUH_AGENT_NAME:-$(hostname)}"

# 1. rsyslog : Debian 13 n'écrit plus /var/log/auth.log par défaut (journald seul).
#    L'agent surveille ce fichier pour les connexions SSH et l'usage de sudo.
apt-get update
apt-get install -y gnupg curl apt-transport-https rsyslog
systemctl enable --now rsyslog

# 2. Dépôt officiel Wazuh
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring \
  --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
  > /etc/apt/sources.list.d/wazuh.list
apt-get update

# 3. Agent à la même version que le manager, enregistré automatiquement
WAZUH_MANAGER="${WAZUH_MANAGER}" WAZUH_AGENT_NAME="${WAZUH_AGENT_NAME}" \
  apt-get install -y "wazuh-agent=${WAZUH_VERSION}-1"

# 4. Empêcher une mise à jour automatique qui rendrait l'agent plus récent que le manager
apt-mark hold wazuh-agent

systemctl daemon-reload
systemctl enable --now wazuh-agent
systemctl --no-pager status wazuh-agent | head -5
