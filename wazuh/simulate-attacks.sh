#!/usr/bin/env bash
# Simule, SUR LA VM ELLE-MÊME, les événements que Wazuh doit détecter.
# À n'exécuter que sur une machine dont vous êtes responsable.
# Usage : sudo bash wazuh/simulate-attacks.sh
set -u

TEST_USER="wazuhtest"

echo "== 1. Force brute SSH : 10 connexions avec des utilisateurs inexistants"
for i in $(seq 1 10); do
  ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=3 \
      "attaquant${i}@127.0.0.1" true 2>/dev/null || true
done

echo "== 2. Création d'un compte local et ajout au groupe sudo"
id "${TEST_USER}" >/dev/null 2>&1 || useradd -m -s /bin/bash "${TEST_USER}"
echo "${TEST_USER}:Workshop6-Test!" | chpasswd
usermod -aG sudo "${TEST_USER}"

echo "== 3. Tentatives d'élévation de privilèges échouées (mauvais mot de passe sudo)"
for i in 1 2 3; do
  su - "${TEST_USER}" -c "echo mauvais-mot-de-passe | sudo -S -k true" 2>/dev/null || true
done

echo "== 4. Élévation de privilèges réussie vers root"
su - "${TEST_USER}" -c "echo 'Workshop6-Test!' | sudo -S -k id" 2>/dev/null || true

echo "== 5. Modification d'un fichier système surveillé (FIM)"
echo "# workshop-6 $(date)" >> /etc/hosts
# L'analyse FIM tourne toutes les 12 h ; un redémarrage de l'agent force une analyse immédiate
systemctl restart wazuh-agent

echo
echo "Terminé. Consultez Threat Hunting / Security events dans le dashboard Wazuh."
echo "Nettoyage ensuite : sudo bash wazuh/cleanup-simulation.sh"
