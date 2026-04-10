import * as React from 'react';

import { ZentraNativeSignalsViewProps } from './ZentraNativeSignals.types';

export default function ZentraNativeSignalsView(props: ZentraNativeSignalsViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
