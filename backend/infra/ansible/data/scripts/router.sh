#!/bin/bash

echo "[TASK 1] Update APT Sources"
sudo sed -i 's|security.ubuntu.com|mirror.kakao.com|g; s|archive.ubuntu.com|mirror.kakao.com|g' /etc/apt/sources.list
sudo apt-get update -y

echo "[TASK 2] Set forwarding & NAT"
sudo sed -i 's|#net.ipv4.ip_forward=1|net.ipv4.ip_forward=1|g' /etc/sysctl.conf
sudo sysctl -p
sudo iptables -t nat -A POSTROUTING -o ens19 -j SNAT --to-source $network_router_ip
sudo iptables -t nat -A POSTROUTING -o eth0 -j SNAT --to-source $public_ip

echo "[TASK 3] Set Port Forwarding"
for port in $ports; do
  sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport $port -j DNAT --to-destination $network_router_ip:$port
done

echo "[TASK 2] Install FRRouting & dhcpd"
sudo apt-get install -y frr isc-dhcp-server

echo "[TASK 3] Configure DHCP Server"
sudo tee /etc/dhcp/dhcpd.conf <<EOF
subnet $network_cidr netmask $network_mask {
  range $network_dhcp_start $network_dhcp_end;
  option routers $network_router_ip;
  option domain-name-servers $network_dns;
  option domain-name "$network_domain";
  default-lease-time 600;
  max-lease-time 7200;
}

echo "[TASK 3] Configure FRRouting"
sudo sed -i 's|zebra=no|zebra=yes|g; s|ospfd=no|ospfd=yes|g; s|bgpd=no|bgpd=yes|g' /etc/frr/daemons
sudo tee /etc/frr/frr.conf <<EOF
frr version 8.1
frr defaults traditional
hostname $hostname
log syslog informational
service integrated-vtysh-config
!
interface ens19
  ip address $network_router_ip/$network_cidr
  no shutdown
  exit
!
router bgp $bgp_as
  bgp router-id $network_router_ip
  neighbor $network_router_ip remote-as $bgp_as
  neighbor $network_router_ip update-source ens19
  neighbor $network_router_ip ebgp-multihop
  neighbor $network_router_ip next-hop-self
  neighbor $network_router_ip activate
  network $network_cidr
exit
!
line vty
EOF

echo "[TASK 4] Restart FRRouting"
sudo systemctl restart frr