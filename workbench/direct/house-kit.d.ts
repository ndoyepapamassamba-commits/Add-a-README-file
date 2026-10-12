declare module 'virtual:house-kit' {
  const kit: import('../server/services/apexCore').HouseKit | null;
  export default kit;
}
declare module 'virtual:three-iife' {
  const code: string;
  export default code;
}
declare module 'virtual:cannon-iife' {
  const code: string;
  export default code;
}
declare module 'virtual:troupe-kit' {
  const kit: import('./lib/studio/troupeKit').TroupeKit | null;
  export default kit;
}
