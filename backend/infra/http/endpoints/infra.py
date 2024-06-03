from fastapi import APIRouter, Depends, Response

from backend.modules.config import Config, get_config
from backend.infra.ansible.generator import PlaybookGenerator
from backend.infra.ansible.play import play
router = APIRouter(tags=["infra"])

@router.post()
async def create_vm_template(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm_template(config)
    play(playbook_path)
    return Response(status_code=200, content=playbook_path)

@router.post()
async def create_vm(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm(config)
    play(playbook_path)
    return Response(status_code=200, content=playbook_path)