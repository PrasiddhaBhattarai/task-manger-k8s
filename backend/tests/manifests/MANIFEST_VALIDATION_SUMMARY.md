# Manifest Validation Test Suite Summary

## Overview

`manifest-validation.test.js` is a Vitest test suite that validates Kubernetes YAML manifests before deployment.

The test suite **does not deploy resources**. Instead, it statically analyzes Kubernetes manifest files located in the `k8s` directory to ensure they are valid, consistent, and follow expected configuration rules.

The goal is to catch deployment issues early by verifying Kubernetes object structure, service connectivity, resource constraints, autoscaling configuration, and storage setup.

---

## Validation Areas

### 1. YAML File Validation

The test suite verifies that:

- All expected Kubernetes manifest files exist.
- YAML files are syntactically valid.
- YAML documents are correctly parsed.
- Multi-document YAML files are supported and validated.

---

### 2. Kubernetes Object Structure Validation

Every Kubernetes resource is checked to ensure it contains required fields:

- `apiVersion`
- `kind`
- `metadata.name`

This prevents malformed Kubernetes objects from being applied during deployment.

---

### 3. Service and Deployment Label Matching

The suite validates Kubernetes Service-to-Deployment connectivity.

It ensures:

- Each Service selector matches labels defined in the corresponding Deployment pod template.
- Services can correctly discover and route traffic to their target Pods.

This prevents common Kubernetes networking issues where Services exist but cannot find matching Pods.

---

### 4. Service DNS and Configuration Validation

The test suite validates application service references.

#### Backend Database Configuration

Checks that:

- Backend `DB_HOST` configuration points to an existing PostgreSQL Service.

#### Frontend Configuration

Checks that:

- Frontend `BACKEND_URL` references an existing backend Service.

This ensures internal Kubernetes service communication is correctly configured.

---

### 5. Resource Limit Validation

All Deployment containers are checked for resource limits.

Required constraints:

| Resource | Maximum Allowed |
|----------|-----------------|
| CPU | `500m` |
| Memory | `512Mi` |

The validation ensures every container defines resource limits and prevents excessive resource consumption.

---

### 6. Horizontal Pod Autoscaler (HPA) Validation

The suite validates Horizontal Pod Autoscaler configuration.

Requirements:

- Exactly one HPA must exist.
- HPA must use:
  - `autoscaling/v2` API version
  - Backend Deployment as the target
- Replica limits:
  - Minimum replicas: `1`
  - Maximum replicas: `5`
- Scaling metric:
  - CPU utilization based scaling
  - Target CPU utilization: `70%`

---

### 7. Storage Validation

The suite verifies PersistentVolume (PV) and PersistentVolumeClaim (PVC) configuration.

## PersistentVolume Validation

Checks:

- Storage size: `1Gi`
- Access mode: `ReadWriteOnce`
- Storage type: `hostPath`

## PersistentVolumeClaim Validation

Checks:

- PVC matches the PV storage class.
- Access mode is `ReadWriteOnce`.

---

## Purpose

This validation suite provides a pre-deployment safety check for Kubernetes manifests by detecting:

- Invalid YAML files
- Missing Kubernetes metadata
- Broken Service-to-Pod connections
- Incorrect application service references
- Invalid resource configurations
- Incorrect autoscaling setup
- Storage misconfigurations

Running these tests before deployment helps ensure Kubernetes resources are correctly configured and ready for deployment.

---

## In one sentence

This test suite acts as a Kubernetes manifest validator that ensures the application architecture (Frontend → Backend → Database), networking, scaling, resource limits, and storage configuration are correct before applying YAML files to a cluster.