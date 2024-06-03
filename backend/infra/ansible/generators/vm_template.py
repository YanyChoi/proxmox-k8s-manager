import string
from pathlib import Path
from backend.config import ProxmoxVMTemplate
class Proxmox(object):
    def __init__(self):
        pass
    def create_vm_template(self, config: ProxmoxVMTemplate):
        path = Path(__file__).parent.parent.parent.parent/'ansible/playbooks/cloud-img.yaml'
        with open(path, 'r') as f:
            template = string.Template(f.read())
            print(template.substitute(config.__dict__))
