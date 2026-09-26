/// <reference types="vite/client" />

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.svg?react' {
  import type React from 'react';
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}


/** Versie van de web-bundel (commit), ingevuld door vite.config.ts. Zie src/native/liveUpdate.ts. */
declare const __APP_BUNDLE_VERSION__: string;
