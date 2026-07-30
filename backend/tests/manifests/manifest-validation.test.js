import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const k8sDir = path.resolve(__dirname, '../../../k8s');

const manifestFiles = [
  'backend-deployment.yaml',
  'backend-service.yaml',
  'frontend-deployment.yaml',
  'frontend-service.yaml',
  'postgres-deployment.yaml',
  'postgres-service.yaml',
  'backend-hpa.yaml',
  'postgres-pvc.yaml',
];

/**
 * Helper to load all YAML documents from a file (supports multi-document files with ---)
 */
function loadAllYamlDocs(filename) {
  const filePath = path.join(k8sDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.loadAll(content).filter(doc => doc !== null && doc !== undefined);
}

/**
 * Helper to find all documents of a given kind across all manifest files
 */
function findDocsByKind(kind) {
  const results = [];
  for (const file of manifestFiles) {
    const docs = loadAllYamlDocs(file);
    for (const doc of docs) {
      if (doc.kind === kind) {
        results.push({ file, doc });
      }
    }
  }
  return results;
}

describe('K8s Manifest YAML Parsing', () => {
  it.each(manifestFiles)('%s parses as valid YAML', (filename) => {
    const filePath = path.join(k8sDir, filename);
    expect(fs.existsSync(filePath)).toBe(true);
    
    const docs = loadAllYamlDocs(filename);
    expect(docs.length).toBeGreaterThan(0);
    
    for (const doc of docs) {
      expect(doc).toHaveProperty('apiVersion');
      expect(doc).toHaveProperty('kind');
      expect(doc).toHaveProperty('metadata');
      expect(doc.metadata).toHaveProperty('name');
    }
  });
});

describe('Service selector and Deployment label consistency', () => {
  const services = findDocsByKind('Service');
  const deployments = findDocsByKind('Deployment');

  it.each(services.map(s => [s.doc.metadata.name, s]))(
    'Service %s selector matches corresponding Deployment pod template labels',
    (_name, { doc: service }) => {
      const selector = service.spec.selector;
      expect(selector).toBeDefined();

      // Find corresponding deployment by matching component label
      const component = selector.component || selector.app;
      const matchingDeployment = deployments.find(({ doc: dep }) => {
        const podLabels = dep.spec.template.metadata.labels;
        return Object.entries(selector).every(
          ([key, value]) => podLabels[key] === value
        );
      });

      expect(matchingDeployment).toBeDefined();

      // Verify all selector keys match pod template labels exactly
      const podLabels = matchingDeployment.doc.spec.template.metadata.labels;
      for (const [key, value] of Object.entries(selector)) {
        expect(podLabels[key]).toBe(value);
      }
    }
  );
});

describe('Service name and DNS hostname consistency', () => {
  const services = findDocsByKind('Service');
  const serviceNames = services.map(s => s.doc.metadata.name);
  const deployments = findDocsByKind('Deployment');

  it('DB_HOST env var references an existing Service name', () => {
    // Find DB_HOST in backend deployment
    const backendDep = deployments.find(
      ({ doc }) => doc.metadata.name === 'backend'
    );
    expect(backendDep).toBeDefined();

    const containers = backendDep.doc.spec.template.spec.containers;
    let dbHost = null;
    for (const container of containers) {
      const envVar = (container.env || []).find(e => e.name === 'DB_HOST');
      if (envVar) {
        dbHost = envVar.value;
        break;
      }
    }

    expect(dbHost).toBeDefined();
    expect(serviceNames).toContain(dbHost);
  });

  it('BACKEND_URL env var references an existing Service name', () => {
    // Find BACKEND_URL in frontend deployment
    const frontendDep = deployments.find(
      ({ doc }) => doc.metadata.name === 'frontend'
    );
    expect(frontendDep).toBeDefined();

    const containers = frontendDep.doc.spec.template.spec.containers;
    let backendUrl = null;
    for (const container of containers) {
      const envVar = (container.env || []).find(e => e.name === 'BACKEND_URL');
      if (envVar) {
        backendUrl = envVar.value;
        break;
      }
    }

    expect(backendUrl).toBeDefined();
    // Extract hostname from URL (e.g., "http://backend-service:3000" → "backend-service")
    const urlMatch = backendUrl.match(/\/\/([^:\/]+)/);
    expect(urlMatch).not.toBeNull();
    const hostname = urlMatch[1];
    expect(serviceNames).toContain(hostname);
  });
});

describe('Resource constraints', () => {
  const deployments = findDocsByKind('Deployment');

  it.each(deployments.map(d => [d.doc.metadata.name, d]))(
    'Deployment %s has CPU ≤500m and memory ≤512Mi',
    (_name, { doc: dep }) => {
      const containers = dep.spec.template.spec.containers;
      for (const container of containers) {
        expect(container.resources).toBeDefined();
        expect(container.resources.limits).toBeDefined();

        const cpuLimit = container.resources.limits.cpu;
        const memLimit = container.resources.limits.memory;

        // Parse CPU: "500m" → 500
        const cpuMilli = parseInt(cpuLimit.replace('m', ''));
        expect(cpuMilli).toBeLessThanOrEqual(500);

        // Parse memory: "512Mi" → 512
        const memMi = parseInt(memLimit.replace('Mi', ''));
        expect(memMi).toBeLessThanOrEqual(512);
      }
    }
  );
});

describe('HPA configuration', () => {
  const hpas = findDocsByKind('HorizontalPodAutoscaler');

  it('HPA targets the backend deployment', () => {
    expect(hpas.length).toBe(1);
    const hpa = hpas[0].doc;

    expect(hpa.apiVersion).toBe('autoscaling/v2');
    expect(hpa.spec.scaleTargetRef.kind).toBe('Deployment');
    expect(hpa.spec.scaleTargetRef.name).toBe('backend');
    expect(hpa.spec.minReplicas).toBe(1);
    expect(hpa.spec.maxReplicas).toBe(5);
  });

  it('HPA uses CPU utilization metric at 70%', () => {
    const hpa = hpas[0].doc;
    const metrics = hpa.spec.metrics;
    expect(metrics.length).toBeGreaterThan(0);

    const cpuMetric = metrics.find(
      m => m.type === 'Resource' && m.resource.name === 'cpu'
    );
    expect(cpuMetric).toBeDefined();
    expect(cpuMetric.resource.target.type).toBe('Utilization');
    expect(cpuMetric.resource.target.averageUtilization).toBe(70);
  });
});

// describe('Storage configuration', () => {
//   const pvs = findDocsByKind('PersistentVolume');
//   const pvcs = findDocsByKind('PersistentVolumeClaim');

//   it('PV has correct configuration', () => {
//     expect(pvs.length).toBe(1);
//     const pv = pvs[0].doc;

//     expect(pv.spec.capacity.storage).toBe('1Gi');
//     expect(pv.spec.accessModes).toContain('ReadWriteOnce');
//     expect(pv.spec.hostPath).toBeDefined();
//   });

//   it('PVC matches PV storageClassName', () => {
//     expect(pvcs.length).toBe(1);
//     const pv = pvs[0].doc;
//     const pvc = pvcs[0].doc;

//     expect(pvc.spec.storageClassName).toBe(pv.spec.storageClassName);
//     expect(pvc.spec.accessModes).toContain('ReadWriteOnce');
//   });
// });

describe('Storage configuration', () => {
  const pvcs = findDocsByKind('PersistentVolumeClaim');

  it('PVC has correct configuration', () => {
    expect(pvcs.length).toBe(1);

    const pvc = pvcs[0].doc;

    expect(pvc.spec.storageClassName).toBe('local-path');
    expect(pvc.spec.resources.requests.storage).toBe('1Gi');
    expect(pvc.spec.accessModes).toContain('ReadWriteOnce');
  });
});