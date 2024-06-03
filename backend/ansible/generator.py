import string
from pathlib import Path
from config.config import ProxmoxVMTemplate, Config

class PlaybookGenerator:
    def __init__(self):
        pass

    def create_vm_template(self, config: ProxmoxVMTemplate) -> str:
        template_path = Path(__file__).parent.parent/'ansible/data/playbooks/cloud-img.yaml'
        generated_path = Path(__file__).parent.parent/'ansible/data/generated/cloud-img.yaml'
        with open(template_path, 'r') as f:
            template = string.Template(f.read())
            with open(generated_path, 'w') as g:
                g.write(template.substitute(config.__dict__))
        return generated_path
        
    def create_vm(self, config: Config) -> list[str]:
        template_path = Path(__file__).parent.parent/'ansible/data/playbooks/vm.yaml'
        generated_path_root = Path(__file__).parent.parent/'ansible/data/generated/'
        generated_paths = []
        with open(template_path, 'r') as f:
            template = string.Template(f.read())
            for vm_config in config.items:
                generated_path = generated_path_root/f'{vm_config.hostname}.yaml'
                with open(generated_path, 'w') as g:
                    g.write(template.substitute({'template_id': config.template.id, 'storage_target': config.storage_target, **vm_config.__dict__, 'bridges': vm_config.get_bridges()}))
                generated_paths.append(str(generated_path))
        return generated_paths