import { requireNativeView } from 'expo';
import * as React from 'react';

import { ZentraNativeSignalsViewProps } from './ZentraNativeSignals.types';

const NativeView: React.ComponentType<ZentraNativeSignalsViewProps> =
  requireNativeView('ZentraNativeSignals');

export default function ZentraNativeSignalsView(props: ZentraNativeSignalsViewProps) {
  return <NativeView {...props} />;
}
