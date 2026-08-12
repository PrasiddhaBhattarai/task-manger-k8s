# Kubernetes Workshop

A hands-on Kubernetes workshop project featuring a full-stack CRUD application (Node.js Express backend, static HTML/Nginx frontend, PostgreSQL database), K3s-compatible Kubernetes manifests, and an interactive HTML workshop page that guides participants through creating Kubernetes resources.

## Directory Structure

```
├── backend/              Node.js Express REST API with PostgreSQL
│   ├── src/              Application source code
│   │   ├── db/           Database connection and init scripts
│   │   └── routes/       API route handlers
│   ├── tests/            Unit and property-based tests
│   └── Dockerfile        Container image definition
├── frontend/             Static HTML/JS frontend served by Nginx
│   ├── public/           Static files (index.html, config.js)
│   ├── nginx.conf        Nginx config template (envsubst + resolver)
│   ├── entrypoint.sh     Container startup script (env substitution)
│   └── Dockerfile        Container image definition
├── k8s-cronJob/                     Kubernetes resource manifests
│   ├── app-config.yaml              Application configuration
│   ├── backend-deployment.yaml      
│   ├── backend-hpa.yaml             
│   ├── backend-service.yaml         
│   ├── db-secret.yaml               Database credentials secret
│   ├── frontend-deployment.yaml     
│   ├── frontend-ingress.yaml        Frontend ingress
│   ├── frontend-service.yaml        
│   ├── postgres-deployment.yaml     
│   ├── postgres-pvc.yaml            
│   ├── postgres-service.yaml         
│   └── cronjob/                     CronJob and logging resources
│       ├── cronjob-rbac.yaml        RBAC configuration for CronJob
│       ├── cronjob.yaml              Kubernetes CronJob
│       ├── fluent-bit.yaml           Fluent Bit logging configuration
│       └── loki.yaml                 Loki logging service
```

## For cornJob
- Apply all manifest
- Port-forward Loki to your machine and query
  - ```kubectl port-forward -n logging svc/loki 3100:3100```
- Wait for cronjob to run (runs every 5 minutes)
- You can manually run when testing
  - ```kubectl create job --from=cronjob/pod-status-logger manual-test-1```
- Apply followinng command to get log messages
   ```bash
    curl -s -G 'http://localhost:3100/loki/api/v1/query_range' \
    --data-urlencode 'query={kubernetes_container_name="logger"}' \
    --data-urlencode 'limit=5000' \
    --data-urlencode 'direction=forward' \
    | jq -r '.data.result[].values[] | .[1] | fromjson | .log // empty'
    ```

## Prerequisites

- **Node.js** >= 18.0.0
- **Docker** for building container images
- **K3s** (or any Kubernetes cluster) with `kubectl` configured and pointing to your cluster

## Building Container Images

Build the backend image:

```bash
sudo docker build -t workshop-backend:latest ./backend
```

Build the frontend image:

```bash
sudo docker build -t workshop-frontend:latest ./frontend
```

> **Note:** These images must be imported into K3s before they can be used. See "Deploying to K3s" below.

## Deploying to K3s

### Quick Deploy (Recommended)

Use the included script that builds images, imports them into K3s, and applies all manifests:

```bash
./build-and-deploy.sh
```

This handles the full workflow: Docker build → K3s image import → kubectl apply → rollout wait.

### Why Image Import?

K3s uses **containerd**, not Docker's image store. Images built with `docker build` are invisible to K3s. You must either:
- Import them: `docker save <image> | sudo k3s ctr images import -`
- Push to a registry (even a local one)

The `build-and-deploy.sh` script handles this automatically.

### Manual Deploy

```bash
# Build images
sudo docker build -t workshop-backend:latest ./backend
sudo docker build -t workshop-frontend:latest ./frontend

# Import into K3s containerd
sudo docker save workshop-backend:latest | sudo k3s ctr images import -
sudo docker save workshop-frontend:latest | sudo k3s ctr images import -

# Apply all manifests
sudo kubectl apply -f k8s/

# Wait for rollout
sudo kubectl rollout status deployment/postgres --timeout=60s
sudo kubectl rollout status deployment/backend --timeout=60s
sudo kubectl rollout status deployment/frontend --timeout=60s
```

Once deployed, access the frontend at:

```
http://localhost:30080
```

### Teardown

```bash
sudo kubectl delete -f k8s/
```

## Running Locally (Without Kubernetes)

### Prerequisites for Local Development

- Node.js >= 18.0.0
- Docker (for running PostgreSQL)
- A static file server (e.g., `npx serve`)

### PostgreSQL

Start a local PostgreSQL instance using Docker:

```bash
docker run -d --name workshop-db \
  -e POSTGRES_DB=workshop \
  -e POSTGRES_USER=workshop \
  -e POSTGRES_PASSWORD=workshop123 \
  -p 5432:5432 \
  postgres:15-alpine
```

### Backend

```bash
cd backend
npm install

# Start in development mode (auto-restarts on file changes)
DB_HOST=localhost DB_PORT=5432 DB_NAME=workshop DB_USER=workshop DB_PASSWORD=workshop123 npm run dev
```

Or start in production mode:

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=workshop DB_USER=workshop DB_PASSWORD=workshop123 npm start
```

The API runs on port 3000 by default (configurable via the `PORT` environment variable).

Verify the backend is running:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### Frontend

Serve the static files with any HTTP server:

```bash
npx serve frontend/public
```

Before starting, update `frontend/public/config.js` to point to the local backend:

```js
window.API_BASE_URL = 'http://localhost:3000/api';
```

Verify the frontend is running by opening `http://localhost:5000` (default port for `npx serve`) in a browser. You should see the task management UI.

## Running Tests

From the `backend/` directory:

```bash
cd backend

# Run unit and property-based tests
npm test

# Run Kubernetes manifest validation tests
npm run test:manifests
```

## Workshop Page

The file `workshop.html` in the project root is a self-contained interactive workshop page. Open it directly in any web browser — no server required.

The page guides participants through creating Kubernetes manifests step by step, providing partial YAML snippets and collapsible hints rather than complete solutions. It covers Deployments, Services, HPA, and persistent storage resources across 8 sequential tasks.

## Troubleshooting

**ImagePullBackOff / ErrImagePull**
Images aren't in K3s's containerd. Run `build-and-deploy.sh` or manually import with:
```bash
sudo docker save workshop-backend:latest | sudo k3s ctr images import -
```

**502 Bad Gateway on /api/**
Nginx can't resolve the backend hostname. The frontend deployment uses `backend-service.default.svc.cluster.local` (FQDN) because nginx's resolver doesn't use search domains. If DNS is broken, try reinstalling K3s:
```bash
sudo /usr/local/bin/k3s-uninstall.sh
curl -sfL https://get.k3s.io | sh -
```

**Backend returns 503 (Database unavailable)**
PostgreSQL isn't ready or the PVC hasn't bound. Check:
```bash
sudo kubectl get pvc
sudo kubectl logs deployment/postgres
```

**Permission denied on kubectl**
K3s config is owned by root. Use `sudo kubectl` or:
```bash
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```
