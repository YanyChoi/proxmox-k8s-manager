#!/bin/bash

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update > /dev/null 2>&1

echo "[TASK 2] Install OpenVPN"
sudo apt-get install -y openvpn easy-rsa > /dev/null 2>&1

echo "[TASK 3] Create OpenVPN CA"
sudo make-cadir /etc/openvpn/server/easy-rsa
sudo /etc/openvpn/server/easy-rsa/easyrsa init-pki
sudo /etc/openvpn/server/easy-rsa/easyrsa build-ca nopass

echo "[TASK 4] Create OpenVPN Server Key"
cd /etc/openvpn/server/easy-rsa
sudo ./easyrsa gen-req --batch server nopass
sudo ./easyrsa gen-dh --batch
sudo ./easyrsa sign-req --batch server server
sudo openvpn --genkey secret ta.key
sudo cp pki/dh.pem pki/ca.crt pki/issued/server.crt pki/private/server.key /etc/openvpn/server/

echo "[TASK 5] Create OpenVPN Client Key"
sudo ./easyrsa gen-req --batch client nopass
sudo ./easyrsa sign-req --batch client client

echo "[TASK 6] Create OpenVPN Server Config"
sudo cp /usr/share/doc/openvpn/examples/sample-config-files/server.conf /etc/openvpn/server/
sudo chmod 644 /etc/openvpn/server/server.conf
sudo sed -i 's|dh dh2048.pem|dh dh.pem|g; s|;push "redirect-gateway def1 bypass-dhcp"|push "redirect-gateway def1 bypass-dhcp"|g; s|;user nobody|user nobody|g; s|;group nobody|group nobody|g' /etc/openvpn/server/server.conf
sudo echo "\npush \"dhcp-option DNS $DNS_PRIMARY\"" >> /etc/openvpn/server/server.conf
sudo echo "push \"dhcp-option DNS $DNS_SECONDARY\"" >> /etc/openvpn/server/server.conf
sudo echo "key-direction 0" >> /etc/openvpn/server/server.conf
sudo echo "auth SHA512" >> /etc/openvpn/server/server.conf

echo "[TASK 7] Enable IP Forwarding"
sudo sed -i 's|#net.ipv4.ip_forward=1|net.ipv4.ip_forward=1|g' /etc/sysctl.conf
sudo sysctl -p
sudo iptables -t nat -A POSTROUTING -s $NETWORK_CIDR -o eth0 -j MASQUERADE

echo "[TASK 8] Start OpenVPN Server"
sudo systemctl start openvpn-server@server
sudo systemctl enable openvpn-server@server
