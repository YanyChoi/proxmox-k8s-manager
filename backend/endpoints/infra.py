from fastapi import APIRouter, Depends, Response

from config.config import Config, get_config
from ansible.generator import PlaybookGenerator
from ansible.play import play
router = APIRouter(tags=["infra"])

@router.post("/vm_template")
async def create_vm_template(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm_template(config.template)
    # play(playbook_path)
    return playbook_path

@router.post("/cluster")
async def create_vm(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm(config)
    # play(playbook_path)
    return playbook_path
