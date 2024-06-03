import string
from pathlib import Path
from config.config import ProxmoxVMTemplate, Config

def create_vm_template(config: ProxmoxVMTemplate) -> str:
    template_path = Path(__file__).parent.parent/'data/playbooks/cloud-img.yaml'
    generated_path = Path(__file__).parent.parent/'generated/playbooks/cloud-img.yaml'
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        with open(generated_path, 'w') as g:
            g.write(template.substitute(config.__dict__))
    return generated_path
    
def create_vm(config: Config) -> list[str]:
    template_path = Path(__file__).parent.parent/'data/playbooks/vm.yaml'
    generated_path_root = Path(__file__).parent.parent/'generated/playbooks'
    generated_paths = []
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        for vm_config in config.items:
            generated_path = generated_path_root/f'{vm_config.hostname}.yaml'
            with open(generated_path, 'w') as g:
                g.write(template.substitute({'template_id': config.template.id, 'storage_target': config.storage_target, **vm_config.__dict__, 'bridges': vm_config.get_bridges()}))
            generated_paths.append(str(generated_path))
    return generated_paths