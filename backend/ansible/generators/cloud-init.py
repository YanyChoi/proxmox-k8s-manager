import string
from pathlib import Path

from config.config import Config
from ansible.generators.write import generate_file

def create_network_data(config: Config) -> str:
    template_path = Path(__file__).parent/'data/network-config.yaml'
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        template.substitute(config.__dict__)