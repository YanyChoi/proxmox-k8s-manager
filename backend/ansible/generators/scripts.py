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

    @classmethod
    def from_config(self, config: Config) -> 'K8sInitConfig':
        return K8sInitConfig(
            K8S_API=get_ip(config.node_cidr, "K8S_API"),
            POD_CIDR=config.pod_cidr,
            SERVICE_CIDR=config.service_cidr,
            DOMAIN=config.domain
        )
class K8sJoinConfig(BaseModel):
    K8S_API: str

    @classmethod
    def from_config(self, config: Config) -> 'K8sJoinConfig':
        return K8sJoinConfig(
            NODES=config.worker.nodes,
            CORES=config.worker.cores,
            MEMORY=config.worker.memory,
            STORAGE=config.worker.storage,
            K8S_API=get_ip(config.node_cidr, "K8S_API"),
            POD_CIDR=config.pod_cidr,
            SERVICE_CIDR=config.service_cidr,
            DOMAIN=config.domain
        )

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

    @classmethod
    def from_config(self, config: Config) -> 'RouterConfig':
        public_ip = requests.get('https://ifconfig.me').text
        dns_servers = dns.resolver.Resolver().nameservers
        return RouterConfig(
            ROUTER_IP=get_ip(config.node_cidr, "ROUTER"),
            PUBLIC_IP=public_ip,
            LB_IP=get_ip(config.node_cidr, "LB"),
            NETWORK_CIDR=config.node_cidr,
            NETWORK_MASK=str(ipaddress.IPv4Network(config.node_cidr).netmask),
            NETWORK_DHCP_START=str(ipaddress.IPv4Network(config.node_cidr).network_address + 2),
            NETWORK_DHCP_END=str(ipaddress.IPv4Network(config.node_cidr).network_address + 254),
            NETWORK_DNS_PRIMARY=dns_servers[0],
            NETWORK_DNS_SECONDARY=dns_servers[1]
        )

class NFSConfig(BaseModel):
    ROUTER_IP: str
    NETWORK_CIDR: str
    
    @classmethod
    def from_config(self, config: Config) -> 'NFSConfig':
        return RouterConfig(
            ROUTER_IP=get_ip(config.node_cidr, "ROUTER"),
            NETWORK_CIDR=config.node_cidr
        )

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
        template_config = RouterConfig.from_config(config)
        template_path = Path(__file__).parent/'scripts/router.sh'
    if type == "NFS":
        template_config = NFSConfig.from_config(config)
        template_path = Path(__file__).parent/'scripts/nfs.sh'
    if type == "MASTER_INIT":
        template_config = K8sInitConfig.from_config(config)
        template_path = Path(__file__).parent/'scripts/k8s-master-init.sh'
    if type == "MASTER_JOIN":
        template_config = K8sJoinConfig.from_config(config)
        template_path = Path(__file__).parent/'scripts/k8s-master-join.sh'
    if type == "WORKER":
        template_config = K8sJoinConfig.from_config(config)
        template_path = Path(__file__).parent/'scripts/k8s-worker.sh'
    
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        return template.substitute(template_config.__dict__)
