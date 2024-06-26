#!/bin/bash

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update -y

echo "[TASK 2] Set forwarding & NAT"
sudo sed -i 's|#net.ipv4.ip_forward=1|net.ipv4.ip_forward=1|g' /etc/sysctl.conf
sudo sysctl -p
sudo iptables -t nat -A POSTROUTING -o ens19 -j SNAT --to-source $NETWORK_ROUTER_IP
sudo iptables -t nat -A POSTROUTING -o eth0 -j SNAT --to-source $PUBLIC_IP

echo "[TASK 3] Set Port Forwarding"

sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j DNAT --to-destination $LB_IP:80
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j DNAT --to-destination $LB_IP:443
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 6443 -j DNAT --to-destination $LB_IP:6443
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 1194 -j DNAT --to-destination $VPN_IP:1194

echo "[TASK 2] Install FRRouting & dhcpd"
sudo apt-get install -y frr isc-dhcp-server

echo "[TASK 3] Configure FRRouting"
sudo sed -i 's|zebra=no|zebra=yes|g; s|ospfd=no|ospfd=yes|g; s|bgpd=no|bgpd=yes|g' /etc/frr/daemons
sudo tee /etc/frr/frr.conf <<EOF
frr version 8.1
frr defaults traditional
hostname router
log syslog informational
service integrated-vtysh-config
!
interface ens19
  ip address $NETWORK_ROUTER_IP/$NETWORK_CIDR
  no shutdown
  exit
!
router bgp $bgp_as
  bgp router-id $NETWORK_ROUTER_IP
  neighbor $NETWORK_ROUTER_IP remote-as $bgp_as
  neighbor $NETWORK_ROUTER_IP update-source ens19
  neighbor $NETWORK_ROUTER_IP ebgp-multihop
  neighbor $NETWORK_ROUTER_IP next-hop-self
  neighbor $NETWORK_ROUTER_IP activate
  network $NETWORK_CIDR
exit
!
line vty
EOF

echo "[TASK 4] Restart FRRouting"
sudo systemctl restart frr

echo "[TASK 5] Configure DHCP Server"
sudo tee /etc/dhcp/dhcpd.conf <<EOF
subnet $NETWORK_CIDR netmask $NETWORK_MASK {
  range $NETWORK_DHCP_START $NETWORK_DHCP_END;
  option routers $NETWORK_ROUTER_IP;
  option domain-name-servers $NETWORK_DNS_PRIMARY, $NETWORK_DNS_SECONDARY;
  default-lease-time 600;
  max-lease-time 7200;
}
EOF