import string
from pathlib import Path
from data import VMTemplateData
class Proxmox(object):
    def __init__(self):
        pass
    def create_vm_template(self, data: VMTemplateData):
        path = Path(__file__).parent.parent.parent.parent/'ansible/playbooks/cloud-img.yaml'
        with open(path, 'r') as f:
            template = string.Template(f.read())
            print(template.substitute(data.__dict__))


if __name__ == '__main__':
    proxmox = Proxmox()
    template_data = VMTemplateData(
        id='100',
        hostname='test',
        bridge='vmbr0',
        password='1234',
        image_url='https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img'
    )
    proxmox.create_vm_template(template_data)