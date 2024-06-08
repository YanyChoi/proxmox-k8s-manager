from pathlib import Path
from pydantic import BaseModel
from functools import lru_cache
import yaml

class NodeConfig(BaseModel):
    nodes: int
    cores: int
    memory: int
    storage: int

class Config(BaseModel):
    storage_target: str
    domain: str
    network_bridge: str
    vm_id_start: int
    node_cidr: str
    pod_cidr: str
    service_cidr: str
    master: NodeConfig
    worker: NodeConfig


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