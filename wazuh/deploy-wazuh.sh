#!/usr/bin/env bash
# Déploie Wazuh en mode single-node (manager + indexer + dashboard) avec Docker,
# à partir du dépôt officiel wazuh-docker, à une version fixée.
# Usage : sudo WAZUH_VERSION=4.14.10 bash wazuh/deploy-wazuh.sh
set -euo pipefail

WAZUH_VERSION="${WAZUH_VERSION:-4.14.10}"   # même version que l'agent (install-agent.sh)
INSTALL_DIR="${INSTALL_DIR:-/opt/wazuh-docker}"

echo "== Wazuh ${WAZUH_VERSION} -> ${INSTALL_DIR}"

# 1. Paramètre noyau requis par l'indexer (déjà posé pour SonarQube, on le garantit)
sysctl -w vm.max_map_count=262144
grep -q '^vm.max_map_count' /etc/sysctl.conf || echo 'vm.max_map_count=262144' >> /etc/sysctl.conf

# 2. Récupération du dépôt officiel à la version choisie
if [ ! -d "${INSTALL_DIR}" ]; then
  git clone --depth 1 -b "v${WAZUH_VERSION}" https://github.com/wazuh/wazuh-docker.git "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}/single-node"

# 3. Certificats TLS internes (indexer, manager, dashboard) : une seule fois
if [ ! -d config/wazuh_indexer_ssl_certs ] || [ -z "$(ls -A config/wazuh_indexer_ssl_certs 2>/dev/null)" ]; then
  docker compose -f generate-indexer-certs.yml run --rm generator
fi

# 4. Démarrage des trois conteneurs
docker compose up -d
docker compose ps

echo
echo "Dashboard : https://<IP_DE_LA_VM> (ou tunnel SSH, voir README)"
echo "Identifiants par défaut : admin / SecretPassword  -> à changer immédiatement"
