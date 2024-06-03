from fastapi import APIRouter
from infra.http.dto.config import GetConfigResponseDTO
router = APIRouter(tags=["config"])

@router.get("/config", response_model=GetConfigResponseDTO)
async def get_config() -> GetConfigResponseDTO:
