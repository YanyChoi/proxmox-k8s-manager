from fastapi import APIRouter

router = APIRouter(tags=["k8s"])

@router.get("/kubeconfig")
async def get_kubeconfig() -> str:

    return 