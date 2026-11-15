"""Stuho (USC student housing operator). robots.txt: Allow /. One public search page lists every building."""
from app.listings.http import PoliteClient, next_data
from app.listings.models import Listing

SEARCH = "https://stuho.com/search?minBeds=Any&maxBeds=Any&minRent=Any&maxRent=Any&moveDate=All+Available+Properties"


def _int(x):
    return int(x) if isinstance(x, (int, float)) and x > 0 else None


async def fetch(client: PoliteClient) -> list[Listing]:
    props = next_data(await client.get_text(SEARCH))["props"]["pageProps"]["properties"]
    out = []
    for p in props.get("data", []):
        if not (p.get("BLatitude") and p.get("BLongitude")):
            continue
        city = (p.get("BCity") or {}).get("Name", "Los Angeles")
        out.append(Listing(
            id=f"stuho:{p['_id']}", source="Stuho",
            url=f"https://stuho.com/for-rent-building/{p['BSlug']}",
            name=p.get("BName") or p["BAddress"],
            address=f"{p['BAddress']}, {city}, {p.get('BState', 'CA')} {p.get('BZipCode', '')}".strip(),
            lat=p["BLatitude"], lng=p["BLongitude"],
            rent=_int(p.get("MinRent")), rentMax=_int(p.get("MaxRent")),
            callForPricing=bool(p.get("BCallForPricing")),
            beds=p.get("MinBeds"), bedsMax=p.get("MaxBeds"), baths=p.get("MinBaths"),
            availability=p.get("BCustomMessage") or None,
            propertyTypes=p.get("BFullPropertyTypes") or [],
            photos=(p.get("BPhotosGeneral") or [])[:5],
            description=f"{p.get('BUnitsCount') or len(p.get('BUnits') or [])} units managed by Stuho",
        ))
    return out
