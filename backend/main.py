from fastapi import FastAPI
from infra.http.endpoints.proxmox import router as proxmox_router
from infra.http.endpoints.k8s import router as k8s_router
app = FastAPI()

app.include_router(proxmox_router, prefix="/proxmox")
app.include_router(k8s_router, prefix="/k8s")