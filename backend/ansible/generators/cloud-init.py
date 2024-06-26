from pydantic import BaseModel
from config.config import Config
from pathlib import Path
import string

from generators.scripts import write_script

class UserDataConfig(BaseModel):
    HOSTNAME: str
    PASSWORD: str
    INIT_SCRIPT: str

    def __init__(self, hostname: str, password: str, script: str):
        self.HOSTNAME = hostname
        self.PASSWORD = password
        self.INIT_SCRIPT = script

def write_cloud_init(type: str, id: str, config: Config) -> str:
    template_path_origin = Path(__file__).parent.parent/'generated/cloud-init'
    if type == "ROUTER":
        script = write_script(config, "ROUTER")
        template_path = template_path_origin/'user-data-router.yaml'
    if type == "LB":
        script = write_script(config, "LB")
        template_path = template_path_origin/'user-data-lb.yaml'
    if type == "VPN":
        script = write_script(config, "VPN")
        template_path = template_path_origin/'user-data-vpn.yaml'
    if type == "MASTER_INIT":
        script = write_script(config, "MASTER_INIT")
        template_path = template_path_origin/'user-data-master-init.yaml'
    if type == "MASTER_JOIN":
        script = write_script(config, "MASTER_JOIN")
        template_path = template_path_origin/'user-data-master-join.yaml'
    if type == "WORKER":
        script = write_script(config, "WORKER")
        template_path = template_path_origin/'user-data-worker.yaml'
    template_config = UserDataConfig(
        hostname=f"{type}-{id}",
        password=config.proxmox.password,
        script=script
    )
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        return template.substitute(template_config.__dict__)

