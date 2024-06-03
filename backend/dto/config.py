from pydantic import BaseModel
from backend.config.config import ProxmoxVMTemplate, ProxmoxVM

class GetConfigResponseDTO(BaseModel):
    