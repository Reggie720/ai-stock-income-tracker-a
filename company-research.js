// Research coverage only. This list never grants financial order permission.
export const COMPANIES = [
 {group:'Construction & demolition services',symbol:'SUNB',name:'Sunbelt Rentals Holdings',brands:['Sunbelt Rentals','Sunbelt'],source:'https://ir.sunbeltrentals.com/',coinbaseCatalog:'unsupported lookup',catalogChecked:'2026-11-25'},
 {group:'Retail & communications',symbol:'WMT',name:'Walmart',brands:['Walmart'],source:'https://stock.walmart.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {group:'Retail & communications',symbol:'ACI',name:'Albertsons Companies',brands:['Albertsons','Safeway'],source:'https://www.albertsonscompanies.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {group:'Retail & communications',symbol:'KR',name:'The Kroger Co.',brands:['Kroger',"Fry's"],source:'https://www.thekrogerco.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {group:'Retail & communications',symbol:'QSR',name:'Restaurant Brands International',brands:['Restaurant Brands','Burger King','Tim Hortons','Popeyes','Firehouse Subs'],source:'https://www.rbi.com/',coinbaseCatalog:'EQUITY product found',catalogChecked:'2026-11-25'},
 {"symbol": "DLTR", "name": "Dollar Tree", "brands": ["Dollar Tree"], "group": "Retail & communications", "source": "https://corporate.dollartree.com/investors", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "DG", "name": "Dollar General", "brands": ["Dollar General"], "group": "Retail & communications", "source": "https://investor.dollargeneral.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "ECHO", "name": "EchoStar", "brands": ["EchoStar", "Boost Mobile", "DISH", "Sling TV"], "group": "Retail & communications", "source": "https://ir.echostar.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "CAT", "name": "Caterpillar", "brands": ["Caterpillar"], "group": "Construction & demolition services", "source": "https://investors.caterpillar.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "URI", "name": "United Rentals", "brands": ["United Rentals"], "group": "Construction & demolition services", "source": "https://investors.unitedrentals.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "PWR", "name": "Quanta Services", "brands": ["Quanta Services"], "group": "Construction & demolition services", "source": "https://investors.quantaservices.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "FLR", "name": "Fluor", "brands": ["Fluor"], "group": "Construction & demolition services", "source": "https://investor.fluor.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "WM", "name": "Waste Management", "brands": ["Waste Management"], "group": "Construction & demolition services", "source": "https://www.wm.com/us/en/business/construction-demolition", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "XOM", "name": "Exxon Mobil", "brands": ["Exxon", "ExxonMobil"], "group": "Oil & natural gas", "source": "https://investor.exxonmobil.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "CVX", "name": "Chevron", "brands": ["Chevron"], "group": "Oil & natural gas", "source": "https://www.chevron.com/investors", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "COP", "name": "ConocoPhillips", "brands": ["ConocoPhillips"], "group": "Oil & natural gas", "source": "https://www.conocophillips.com/investor-relations/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "LNG", "name": "Cheniere Energy", "brands": ["Cheniere"], "group": "Oil & natural gas", "source": "https://lngir.cheniere.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "NVDA", "name": "NVIDIA", "brands": ["NVIDIA"], "group": "Chips & computers", "source": "https://investor.nvidia.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "AMD", "name": "Advanced Micro Devices", "brands": ["Advanced Micro Devices", "AMD"], "group": "Chips & computers", "source": "https://ir.amd.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "INTC", "name": "Intel", "brands": ["Intel"], "group": "Chips & computers", "source": "https://www.intc.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "TSM", "name": "Taiwan Semiconductor Manufacturing", "brands": ["TSMC", "Taiwan Semiconductor"], "group": "Chips & computers", "source": "https://investor.tsmc.com/english", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "AVGO", "name": "Broadcom", "brands": ["Broadcom"], "group": "Chips & computers", "source": "https://investors.broadcom.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "AAPL", "name": "Apple", "brands": ["Apple"], "group": "Chips & computers", "source": "https://investor.apple.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "MSFT", "name": "Microsoft", "brands": ["Microsoft", "Windows"], "group": "Chips & computers", "source": "https://www.microsoft.com/en-us/Investor/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "CRUS", "name": "Cirrus Logic", "brands": ["Cirrus Logic"], "group": "Chips & computers", "source": "https://investor.cirrus.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "DELL", "name": "Dell Technologies", "brands": ["Dell Technologies"], "group": "Chips & computers", "source": "https://investors.delltechnologies.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null},
 {"symbol": "LOGI", "name": "Logitech", "brands": ["Logitech"], "group": "Chips & computers", "source": "https://ir.logitech.com/", "coinbaseCatalog": "Not checked; research only", "catalogChecked": null}
];
export const COMPANY_SYMBOLS=COMPANIES.map(x=>x.symbol);
export const RESEARCH_SYMBOLS=[...new Set(['SGOV','JEPI','DIVO','O',...COMPANY_SYMBOLS])];
export const RESEARCH_BATCHES=Array.from({length:Math.ceil(RESEARCH_SYMBOLS.length/6)},(_,i)=>RESEARCH_SYMBOLS.slice(i*6,i*6+6));
