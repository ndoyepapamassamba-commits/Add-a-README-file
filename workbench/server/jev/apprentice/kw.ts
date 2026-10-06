// Tiny keyword extractor shared by the apprentice modules (accent-insensitive, stop words removed).
const STOP = new Set(
  'le la les un une des de du et ou en au aux pour par sur dans avec ce cette ces mon ma mes qui que est sont the a an of to in on for and or with is are this that it as at by from'.split(
    ' ',
  ),
);
export const keywordsOf = (text: string, max = 12): string[] => {
  const w = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length > 3 && !STOP.has(x) && !/^\d+$/.test(x));
  return [...new Set(w)].slice(0, max);
};
