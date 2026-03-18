// Type declarations for modules that lack proper Node16 moduleResolution support
declare module 'next/server' {
  export { NextRequest } from 'next/dist/server/web/spec-extension/request';
  export { NextResponse } from 'next/dist/server/web/spec-extension/response';
}
