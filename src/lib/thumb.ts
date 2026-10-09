// Small rendition of a card image: TCGdex serves a "low" webp; PriceCharting's
// 60 px image is fine as is.
export function cardThumb(url: string): string {
  return url.replace(/\/high\.webp$/, "/low.webp");
}
