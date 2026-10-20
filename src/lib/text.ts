/** Minúsculas y sin acentos, para búsquedas tolerantes ("hidraulico" = "hidráulico"). */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
