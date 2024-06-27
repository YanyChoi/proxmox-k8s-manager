from pathlib import Path
from pydantic import BaseModel
from functools import lru_cache
import yaml

class NetworkConfig(BaseModel):
    domain: str
    node_cidr: str
    pod_cidr: str
    service_cidr: str
    vpn_cidr: str

class ProxmoxConfig(BaseModel):
    storage_target: str
    network_bridge: str
    password: str
    vm_template_id: int
    vm_id_start: int

class NodeConfig(BaseModel):
    nodes: int
    cores: int
    memory: int
    storage: int

class AuthConfig(BaseModel):
    password: str

class Config(BaseModel):
    network: NetworkConfig
    proxmox: ProxmoxConfig
    master: NodeConfig
    worker: NodeConfig
    auth: AuthConfig


# @lru_cache
def get_config():
    config_path = Path(__file__).parent.parent.parent/'config.yaml'
    with open(config_path, 'r') as f:
        data = yaml.safe_load(f)
    return Config(**data)

def update_config(config: Config):
    config_path = Path(__file__).parent.parent/'config.yaml'
    with open(config_path, 'w') as f:
        yaml.dump(config, f)