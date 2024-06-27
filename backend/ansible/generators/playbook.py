import string
from pathlib import Path
from pydantic import BaseModel

from config.config import Config

class ProxmoxVMTemplateConfig(BaseModel):
    ID: int
    IMAGE_URL: str
    BRIDGE: str
    USERNAME: str
    PASSWORD: str
    STORAGE_TARGET: str

    def __init__(self, config: Config):
        self.ID=config.proxmox.vm_template_id
        self.IMAGE_URL="https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img"
        self.BRIDGE="vmbr0"
        self.USERNAME="ubuntu"
        self.PASSWORD=config.proxmox.password
        self.STORAGE_TARGET=config.proxmox.storage_target

class ProxmoxVMConfig(BaseModel):
    TEMPLATE_ID: str
    ID: int
    HOSTNAME: str
    TYPE: str
    BRIDGES: str
    CORES: int
    MEMORY: int
    STORAGE: int
    USER_DATA_PATH: str
    NETWORK_DATA_PATH: str

    def __init__(self, config: Config, id: int, type: str):
        bridges = [config.proxmox.network_bridge]
        user_data_path = Path(__file__).parent.parent/'generated/cloud-init'
        network_data_path = Path(__file__).parent.parent/'data/cloud-init/network.yaml'
        if type == "ROUTER":
            bridges.append("vmbr0")
            cores = 2
            memory = 2048
            storage = 8
            user_data_path = user_data_path/'user-data-router.yaml'
        if type == "LB":
            cores = 2
            memory = 2048
            storage = 8
            user_data_path = user_data_path/'user-data-lb.yaml'
        if type == "VPN":
            cores = 2
            memory = 2048
            storage = 8
            user_data_path = user_data_path/'user-data-vpn.yaml'
        if type == "NFS":
            cores = 2
            memory = 2048
            storage = 32
            user_data_path = user_data_path/'user-data-nfs.yaml'
        if type == "MASTER_INIT":
            cores = config.master.cores
            memory = config.master.memory
            storage = config.master.storage
            user_data_path = user_data_path/'user-data-master-init.yaml'
        if type == "MASTER_JOIN":
            cores = config.master.cores
            memory = config.master.memory
            storage = config.master.storage
            user_data_path = user_data_path/'user-data-master-join.yaml'
        if type == "WORKER":
            cores = config.worker.cores
            memory = config.worker.memory
            storage = config.worker.storage
            user_data_path = user_data_path/'user-data-worker.yaml'

        self.TEMPLATE_ID=config.proxmox.vm_template_id
        self.ID=id
        self.HOSTNAME=f"{type}-{id}"
        self.TYPE=type
        self.BRIDGES=bridges
        self.CORES=cores
        self.MEMORY=memory
        self.STORAGE=storage
        self.USER_DATA_PATH=user_data_path
        self.NETWORK_DATA_PATH=network_data_path
    

def write_playbook(config: Config, id: int, type: str) -> str:

    if type == "TEMPLATE":
        template_config = ProxmoxVMTemplateConfig.from_config(config)
        template_path = Path(__file__).parent.parent/'data/playbooks/cloud-img.yaml'
    else:
        template_config = ProxmoxVMConfig.from_config(config, id, type)
        template_path = Path(__file__).parent.parent/'data/playbooks/vm.yaml'
    
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        return template.substitute(template_config.__dict__)