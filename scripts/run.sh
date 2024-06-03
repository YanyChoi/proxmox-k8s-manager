#!/bin/bash

sudo cat <<EOF > /etc/systemd/system/proxmox-k8s-manager.service
[Unit]
Description=Proxmox K8s Manager
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/root/proxmox-k8s-manager
ExecStart=/usr/bin/python3 -m fastapi prod /root/proxmox-k8s-manager/backend/.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF