#!/bin/bash

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update > /dev/null 2>&1

echo "[TASK 2] Install OpenVPN"
sudo apt-get install -y openvpn easy-rsa > /dev/null 2>&1

echo "[TASK 3] Create OpenVPN CA"
sudo make-cadir /etc/openvpn/server/easy-rsa
cd /etc/openvpn/server/easy-rsa
./easyrsa --batch init-pki
./easyrsa --batch build-ca nopass

echo "[TASK 4] Create OpenVPN Server Keys"
./easyrsa --batch gen-dh
./easyrsa --batch --days=3650 build-server-full server nopass
./easyrsa --batch --days=3650 build-client-full "$client" nopass
./easyrsa --batch --days=3650 gen-crl
sudo openvpn --genkey secret /etc/openvpn/server/ta.key
sudo cp pki/dh.pem pki/ca.crt pki/issued/server.crt pki/private/server.key pki/crl.pem /etc/openvpn/server/
sudo chmod o+x /etc/openvpn/server/

echo "[TASK 5] Create OpenVPN Server Config"
sudo cat <<EOF > /etc/openvpn/server/server.conf
port 1194
proto udp
dev tun
ca ca.crt
cert server.crt
key server.key
dh dh.pem
auth SHA512
tls-crypt ta.key
topology subnet
server $VPN_CIDR $VPN_NETMASK
push "redirect-gateway def1 bypass-dhcp"
ifconfig-pool-persist ipp.txt
push "dhcp-option DNS $DNS_PRIMARY"
push "dhcp-option DNS $DNS_SECONDARY"
push "block-outside-dns"
keepalive 10 120
user nobody
group nogroup
persist-key
persist-tun
verb 3
crl-verify crl.pem
EOF

echo "[TASK 6] Enable IP Forwarding"
sudo sed -i 's|#net.ipv4.ip_forward=1|net.ipv4.ip_forward=1|g' /etc/sysctl.conf
sudo sysctl -p
sudo iptables -t nat -A POSTROUTING -s $NETWORK_CIDR -o eth0 -j MASQUERADE

echo "[TASK 7] Start OpenVPN Server"
sudo systemctl start openvpn-server@server
sudo systemctl enable openvpn-server@server
