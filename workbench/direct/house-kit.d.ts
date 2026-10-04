declare module 'virtual:house-kit' {
  const kit: import('../server/services/apexCore').HouseKit | null;
  export default kit;
}
declare module 'virtual:three-iife' {
  const code: string;
  export default code;
}
