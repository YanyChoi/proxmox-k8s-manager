from fastapi import APIRouter, Depends, Response

from config.config import Config, get_config
from ansible.generator import PlaybookGenerator
from ansible.play import play
router = APIRouter(tags=["infra"])

@router.post("/vm_template/plan")
async def plan_vm_template(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm_template(config.template)
    return playbook_path

@router.post("/cluster/plan")
async def plan_vm(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm(config)
    return playbook_path

@router.post("/vm_template/apply")
async def apply_vm_template(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm_template(config.template)
    play(playbook_path)
    return Response(status_code=200)

@router.post("/cluster/apply")
async def apply_vm(config: Config = Depends(get_config)) -> Response:
    playbook_path = PlaybookGenerator().create_vm(config)
    play(playbook_path)
    return Response(status_code=200)