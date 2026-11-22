#!/usr/bin/env bash
# Annule les modifications faites par simulate-attacks.sh.
# Usage : sudo bash wazuh/cleanup-simulation.sh
set -u

TEST_USER="wazuhtest"

if id "${TEST_USER}" >/dev/null 2>&1; then
  userdel -r "${TEST_USER}" && echo "Compte ${TEST_USER} supprimé"
fi
sed -i '/^# workshop-6 /d' /etc/hosts && echo "/etc/hosts restauré"
