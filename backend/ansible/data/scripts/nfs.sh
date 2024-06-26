#!/bin/bash

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update -y

echo "[TASK 2] Install NFS"
sudo apt-get install -y nfs-kernel-server

echo "[TASK 3] Create NFS Share"
sudo mkdir -p /mnt/nfs
sudo chown nobody:nogroup /mnt/nfs
sudo chmod 777 /mnt/nfs
sudo tee /etc/exports <<EOF
/mnt/nfs $NETWORK_ROUTER_IP/$NETWORK_CIDR(rw,sync,no_subtree_check,no_root_squash)
EOF

echo "[TASK 4] Restart NFS Server"
sudo systemctl restart nfs-kernel-server
sudo systemctl enable nfs-kernel-server