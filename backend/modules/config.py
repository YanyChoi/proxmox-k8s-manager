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
    storage_target: str

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
        

# @lru_cache
def get_config():
    config_path = Path(__file__).parent.parent.parent/'config.yaml'
    with open(config_path, 'r') as f:
        data = yaml.safe_load(f)
        storage_target = data['storage_target']
        network_cidr = data['network_cidr']
        template = ProxmoxVMTemplate(**data['template'])
        items = [ProxmoxVM(**item) for item in data['items']]
    return Config(
        storage_target=storage_target,
        network_cidr=network_cidr,
        template=template,
        items=items
    )

def update_config(config: Config):
    config_path = Path(__file__).parent.parent/'config.yaml'
    with open(config_path, 'w') as f:
        yaml.dump(config.data, f)