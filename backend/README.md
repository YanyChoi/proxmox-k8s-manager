# proxmox-k8s-manager - Backend

The backend is a FastAPI project, forming a web server that generates and runs the ansible playbooks.

## Project Structure

- Ansible: contains the playbook formats and the player which runs the ansible playbooks inside this node.
- endpoints: contains the endpoints for FastAPI.
- dto: Stores DTOs used for HTTP endpoints.
- config: reads & manages `config.yaml` in root.

## Future Improvements
- Provide monitoring for Proxmox nodes & cluster