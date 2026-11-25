import { useState } from "react";
import type { CardLinks } from "../lib/api";

// Links out to price pages for checking a card's price by hand when the
// tracker's data looks stale. Nothing is fetched: direct pages when the
// tracker has the product (TCGplayer id, PriceCharting page), searches
// otherwise. PokeData and 130point have no search links, so those open the
// site and copy the search text to paste.

export interface LinkCard { name: string; number: string; set_code?: string; links?: CardLinks }

const enc = encodeURIComponent;
const num = (n: string) => n.replace(/^0+(?=\d)/, "");
const query = (c: LinkCard) => `${c.name} ${num(c.number)}${c.links?.set_name ? ` ${c.links.set_name}` : ""}`;
const ebaySold = (q: string) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&LH_Sold=1&LH_Complete=1&_sop=13`;

export function tcgplayerUrl(c: LinkCard) {
  return c.links?.tcgplayer_id
    ? `https://www.tcgplayer.com/product/${enc(c.links.tcgplayer_id)}`
    : `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${enc(query(c))}`;
}
export function pricechartingUrl(c: LinkCard) {
  return c.links?.pricecharting_url || `https://www.pricecharting.com/search-products?type=prices&q=${enc(query(c))}`;
}

const A = "text-indigo-300/90 hover:text-indigo-200 underline-offset-2 hover:underline";

function Out({ href, label, title, guess }: { href: string; label: string; title: string; guess?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className={A}>
      {label}{guess && <span className="text-gray-500" title="No product link stored: this is a search">?</span>}
    </a>
  );
}

// Opens the site and copies the search text (the site has no search link).
function CopyOut({ href, label, text, title }: { href: string; label: string; text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <a href={href} target="_blank" rel="noreferrer" title={`${title}\nCopies: ${text}`} className={A}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
      }}>
      {label}{copied && <span className="text-emerald-400"> copied</span>}
    </a>
  );
}

export function RawLinks({ c }: { c: LinkCard }) {
  const q = query(c);
  const set = c.links?.set_name;
  return (
    <span className="inline-flex flex-col gap-0.5 text-[11px] whitespace-nowrap">
      <Out href={tcgplayerUrl(c)} label="TCGplayer" guess={!c.links?.tcgplayer_id} title="TCGplayer: market price, listings and recent sales" />
      <Out href={pricechartingUrl(c)} label="PriceCharting" guess={!c.links?.pricecharting_url} title="PriceCharting: ungraded price and sales" />
      <Out href={ebaySold(`${q} -psa -cgc -bgs -tag`)} label="eBay sold" title="eBay sold and completed raw copies, newest first" />
      {set
        ? <CopyOut href={`https://www.pokedata.io/set/${enc(set).replace(/%20/g, "+")}`} label="PokeData" text={`${c.name} ${num(c.number)}`} title="PokeData: the card's set page (find the card there)" />
        : <CopyOut href="https://www.pokedata.io/" label="PokeData" text={q} title="PokeData" />}
    </span>
  );
}

export function GradedLinks({ c, grade = "PSA 10" }: { c: LinkCard; grade?: string }) {
  const q = query(c);
  return (
    <span className="inline-flex flex-col gap-0.5 text-[11px] whitespace-nowrap">
      <Out href={pricechartingUrl(c)} label="PriceCharting" guess={!c.links?.pricecharting_url} title="PriceCharting: graded prices (PSA/CGC/BGS) and their sales on the card page" />
      <Out href={ebaySold(`${q} ${grade}`)} label={`eBay sold ${grade}`} title={`eBay sold and completed ${grade} copies, newest first`} />
      <CopyOut href="https://130point.com/sales/" label="130point" text={`${q} ${grade}`} title="130point sales search (eBay best offers included): paste the copied search" />
    </span>
  );
}
