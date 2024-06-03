from pathlib import Path
from pydantic import BaseModel
from functools import lru_cache
import yaml

class ProxmoxVMTemplate(BaseModel):
    id: int
    hostname: str
    bridge: str
    password: str
    image_url: str

class ProxmoxVM(BaseModel):
    id: int
    hostname: str
    bridge: list[str]
    password: str

class Config(BaseModel):

    storage_target: str
    network_cidr: str
    template: ProxmoxVMTemplate
    items: list[ProxmoxVM]

    
    def __init__(self):
        config_path = Path(__file__).parent.parent/'config.yaml'
        with open(config_path, 'r') as f:
            self.data = yaml.safe_load(f)

# @lru_cache
def get_config():
    return Config()

def update_config(config: Config):
    config_path = Path(__file__).parent.parent/'config.yaml'
    with open(config_path, 'w') as f:
        yaml.dump(config.data, f)