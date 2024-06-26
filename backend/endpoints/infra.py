from fastapi import APIRouter, Depends, Response

from config.config import Config, get_config
from ansible.play import generate, play
router = APIRouter(tags=["infra"])

@router.post("/generate")
async def plan(config: Config = Depends(get_config)) -> Response:
    generate(config)

@router.post("/apply")
async def apply() -> Response:
    play()
    return Response(status_code=200)
