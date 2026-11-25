// Research coverage only. This list never grants financial order permission.
export const COMPANIES = [
 {symbol:'SUNB',name:'Sunbelt Rentals Holdings',brands:['Sunbelt Rentals','Sunbelt'],source:'https://ir.sunbeltrentals.com/',coinbaseCatalog:'unsupported lookup',catalogChecked:'2026-11-25'},
 {symbol:'WMT',name:'Walmart',brands:['Walmart'],source:'https://stock.walmart.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {symbol:'ACI',name:'Albertsons Companies',brands:['Albertsons','Safeway'],source:'https://www.albertsonscompanies.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {symbol:'KR',name:'The Kroger Co.',brands:['Kroger',"Fry's"],source:'https://www.thekrogerco.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {symbol:'QSR',name:'Restaurant Brands International',brands:['Restaurant Brands','Burger King','Tim Hortons','Popeyes','Firehouse Subs'],source:'https://www.rbi.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'}
];
export const COMPANY_SYMBOLS=COMPANIES.map(x=>x.symbol);
