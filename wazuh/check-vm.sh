#!/usr/bin/env bash
# Vérifie que la VM peut accueillir Wazuh (single-node) avant le déploiement.
# Usage : bash wazuh/check-vm.sh
set -u

echo "== Système"
grep PRETTY_NAME /etc/os-release
uname -r
echo
echo "== Ressources (Wazuh single-node : 4 Go de RAM minimum, 8 Go conseillés)"
nproc
free -h
df -h /
echo
echo "== Docker"
docker --version
docker compose version
echo
echo "== Conteneurs déjà en place"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
echo
echo "== Paramètre noyau requis par l'indexer (>= 262144)"
sysctl vm.max_map_count
echo
echo "== Ports utilisés par Wazuh déjà occupés ? (443, 1514, 1515, 514, 9200, 55000)"
ss -ltnup | grep -E ':(443|1514|1515|514|9200|55000)\b' || echo "aucun : OK"
