from fastapi import FastAPI
from endpoints.proxmox import router as proxmox_router
from endpoints.k8s import router as k8s_router
from endpoints.infra import router as infra_router
from endpoints.config import router as config_router
app = FastAPI()

app.include_router(proxmox_router, prefix="/proxmox")
app.include_router(k8s_router, prefix="/k8s")
app.include_router(infra_router, prefix="/infra")
app.include_router(config_router, prefix="/config")