from pydantic import BaseModel


class ProxmoxVMTemplateDTO(BaseModel):
    id: int
    hostname: str
    bridge: str
    password: str
    image_url: str

class ProxmoxVMDTO(BaseModel):
    id: int
    hostname: str
    bridge: list[str]
    password: str

class GetConfigResponseDTO(BaseModel):
    storage_client: str
    network_cidr: str
    template: ProxmoxVMTemplateDTO
    items: list[ProxmoxVMTemplateDTO]