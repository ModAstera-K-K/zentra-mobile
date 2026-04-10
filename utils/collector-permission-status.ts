import type {
  CollectorDiagnosticRecord,
  CollectorState,
  PermissionStatus,
} from '@/types/zentra';

function isUnsupportedMessage(message: string): boolean {
  return /unsupported in this build|requires native|custom native|expo prototype/i.test(message);
}

function isDeniedMessage(message: string): boolean {
  return /permission denied|access denied/i.test(message);
}

function isNotGrantedMessage(message: string): boolean {
  return /not granted|permission is required|required for|usage access|install or update health connect/i.test(message);
}

function isPermissionMessage(message: string): boolean {
  return /permission|access/i.test(message);
}

export function deriveDiagnosticPermissionStatus(
  diagnostic: CollectorDiagnosticRecord | undefined,
  fallback: PermissionStatus,
): PermissionStatus {
  if (!diagnostic) {
    return fallback;
  }

  if (diagnostic.status === 'success') {
    return 'granted';
  }

  const message = diagnostic.message ?? '';

  if (isUnsupportedMessage(message)) {
    return 'unsupported';
  }

  if (isDeniedMessage(message)) {
    return 'blocked';
  }

  if (isNotGrantedMessage(message)) {
    return 'not_requested';
  }

  return fallback;
}

export function formatCollectorPermissionStatusLabel(collector: CollectorState): string {
  switch (collector.permissionStatus) {
    case 'granted':
      return 'Granted';
    case 'derived':
      return 'Derived locally';
    case 'not_requested':
      return 'Not granted';
    case 'unsupported':
      return 'Unsupported in this build';
    case 'blocked':
      return isPermissionMessage(collector.lastRunLabel) ? 'Permission denied' : 'Unavailable on this device';
    default:
      return 'Unknown';
  }
}
