#!/bin/bash

set -e

for file in ./k8s/*.yaml; do
  echo "Applying $file..."
  kubectl apply -f "$file"
  echo ""
done

echo "All Kubernetes manifests applied successfully."
