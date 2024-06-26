from fastapi import APIRouter, Depends, Response
from config.config import Config, get_config, update_config
router = APIRouter(tags=["config"])

@router.get("", response_model=Config)
async def get_config(config: Config = Depends(get_config)) -> Response:
    return config

@router.put("")
async def put_config(config: Config) -> Response:
    # update config file
    update_config(config)
    return Response(status_code=200)
