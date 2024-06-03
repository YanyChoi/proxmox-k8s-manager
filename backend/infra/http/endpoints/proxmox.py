from fastapi import APIRouter

router = APIRouter(tags=["Proxmox"])

@router.post()