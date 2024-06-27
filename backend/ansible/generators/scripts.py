from pydantic import BaseModel
from pathlib import Path
import string
import requests
import ipaddress
import dns.resolver

from config.config import Config

class K8sInitConfig(BaseModel):
    K8S_API: str
    POD_CIDR: str
    SERVICE_CIDR: str
    DOMAIN: str

    def __init__(self, config: Config):
        self.K8S_API=get_ip(config.network.node_cidr, "K8S_API")
        self.POD_CIDR=config.network.pod_cidr
        self.SERVICE_CIDR=config.network.service_cidr
        self.DOMAIN=config.network.domain
class K8sJoinConfig(BaseModel):
    K8S_API: str

    def __init__(self, config: Config):
        self.NODES=config.worker.nodes
        self.CORES=config.worker.cores
        self.MEMORY=config.worker.memory
        self.STORAGE=config.worker.storage
        self.K8S_API=get_ip(config.network.node_cidr, "K8S_API")
        self.POD_CIDR=config.network.pod_cidr
        self.SERVICE_CIDR=config.network.service_cidr
        self.DOMAIN=config.network.domain

class RouterConfig(BaseModel):
    ROUTER_IP: str
    PUBLIC_IP: str
    LB_IP: str
    VPN_IP: str
    NETWORK_CIDR: str
    NETWORK_MASK: str
    NETWORK_DHCP_START: str
    NETWORK_DHCP_END: str
    NETWORK_DNS_PRIMARY: str
    NETWORK_DNS_SECONDARY: str

    def __init__(self, config: Config):
        public_ip = requests.get('https://ifconfig.me').text
        dns_servers = dns.resolver.Resolver().nameservers

        self.ROUTER_IP=get_ip(config.network.node_cidr, "ROUTER")
        self.PUBLIC_IP=public_ip
        self.LB_IP=get_ip(config.network.node_cidr, "LB")
        self.NETWORK_CIDR=config.network.node_cidr
        self.NETWORK_MASK=str(ipaddress.IPv4Network(config.network.node_cidr).netmask)
        self.NETWORK_DHCP_START=str(ipaddress.IPv4Network(config.network.node_cidr).network_address + 2)
        self.NETWORK_DHCP_END=str(ipaddress.IPv4Network(config.network.node_cidr).network_address + 254)
        self.NETWORK_DNS_PRIMARY=dns_servers[0]
        self.NETWORK_DNS_SECONDARY=dns_servers[1]


class NFSConfig(BaseModel):
    ROUTER_IP: str
    NETWORK_CIDR: str
    
    def __init__(self, config: Config):
        self.ROUTER_IP = get_ip(config.network.node_cidr, "ROUTER")
        self.NETWORK_CIDR = config.network.node_cidr
    
class VPNConfig(BaseModel):
    VPN_CIDR: str
    IP_PREFIX: str
    IP_NETMASK: str
    DNS_PRIMARY: str
    DNS_SECONDARY: str

    def __init__(self, config: Config):
        self.VPN_CIDR = config.network.vpn_cidr
        self.IP_PREFIX = str(ipaddress.IPv4Network(config.network.vpn_cidr).network_address)
        self.IP_NETMASK = str(ipaddress.IPv4Network(config.network.vpn_cidr).netmask)
        self.DNS_PRIMARY = config.network.domain
        self.DNS_SECONDARY = config.network.domain

def get_ip(cidr: str, type: str) -> str:
    CIDR = ipaddress.IPv4Network(cidr)
    suffix: int
    if type == "ROUTER":
        suffix = 1
    if type == "VPN":
        suffix = 2
    if type == "NFS":
        suffix = 3
    if type == "LB":
        suffix = 4
    if type == "K8S_API":
        suffix = 5
    return str(CIDR.network_address + suffix)
    
def write_script(config: Config, type: str) -> str:
    if type == "ROUTER":
        template_config = RouterConfig(config)
        template_path = Path(__file__).parent/'scripts/router.sh'
    if type == "VPN":
        template_config = VPNConfig(config)
        template_path = Path(__file__).parent/'scripts/vpn.sh'
    if type == "NFS":
        template_config = NFSConfig(config)
        template_path = Path(__file__).parent/'scripts/nfs.sh'
    if type == "MASTER_INIT":
        template_config = K8sInitConfig(config)
        template_path = Path(__file__).parent/'scripts/k8s-master-init.sh'
    if type == "MASTER_JOIN":
        template_config = K8sJoinConfig(config)
        template_path = Path(__file__).parent/'scripts/k8s-master-join.sh'
    if type == "WORKER":
        template_config = K8sJoinConfig(config)
        template_path = Path(__file__).parent/'scripts/k8s-worker.sh'
    
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        return template.substitute(template_config.__dict__)
