// Modules virtuels fournis par vite.config.ts au moment de la construction.
declare module 'virtual:three-iife' {
  const code: string;
  export default code;
}
declare module 'virtual:cannon-iife' {
  const code: string;
  export default code;
}
declare module 'virtual:troupe-kit' {
  const kit: import('../navigateur/studio/troupeKit').TroupeKit | null;
  export default kit;
}
