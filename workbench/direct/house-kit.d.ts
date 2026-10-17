declare module 'virtual:house-kit' {
  const kit: import('../server/services/apexCore').HouseKit | null;
  export default kit;
}
