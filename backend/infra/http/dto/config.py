from pydantic import BaseModel
from backend.modules.config import ProxmoxVMTemplate, ProxmoxVM

class GetConfigResponseDTO(BaseModel):
    