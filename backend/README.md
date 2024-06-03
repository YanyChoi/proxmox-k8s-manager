# proxmox-k8s-manager - Backend

The backend is a FastAPI project, forming a web server that generates and runs the ansible playbooks.

## Project Structure
The structure separates the infra part, which is the adapters that connect this project to other components (i.e. Ansible, HTTP), with any separate business logic this server performs.

### Infra
- Ansible: contains the playbook formats and the player which runs the ansible playbooks inside this node.
- HTTP: contains the endpoints for FastAPI.


## Future Improvements
- Provide monitoring for Proxmox nodes & cluster