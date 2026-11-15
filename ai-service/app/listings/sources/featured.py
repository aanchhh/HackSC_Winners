"""Curated well-known USC-area buildings. SAMPLE DATA: real names/locations, illustrative floorplans and prices
(marked sampleData=True and labeled in the UI). Replace with real numbers from each property when available."""
from app.listings.http import PoliteClient
from app.listings.models import Listing, make_unit

# typical USC-area pricing (per unit for entire, per person for rooms)
FULL = [
    ("entire", 0, 1, None, 1795), ("entire", 1, 1, None, 2150), ("entire", 2, 1, None, 2750),
    ("entire", 2, 2, None, 3150), ("entire", 3, 2, None, 3850), ("entire", 3, 3, None, 4350),
    ("private_room", 4, 4, True, 1450), ("private_room", 4, 2, False, 1150), ("shared_room", 2, 2, True, 899),
]

BUILDINGS = [
    dict(key="lorenzo", name="The Lorenzo", address="325 W Adams Blvd, Los Angeles, CA 90007", lat=34.02868, lng=-118.27262,
         url="https://www.thelorenzo.com/", amenities=["Furnished", "Gym", "Pool", "Shuttle to USC", "Study rooms", "Parking", "In-unit laundry"],
         plans=FULL, desc="Large furnished student community with a free shuttle to campus."),
    dict(key="menlo", name="Menlo (2678 Menlo Ave)", address="2678 Menlo Ave, Los Angeles, CA 90007", lat=34.03046, lng=-118.29003,
         url="", amenities=["Furnished", "Laundry", "AC"],
         plans=[p for p in FULL if p[1] in (1, 2, 4)], desc="Smaller walk-up building north of campus."),
    dict(key="ellendale", name="Ellendale (2666 Ellendale Pl)", address="2666 Ellendale Pl, Los Angeles, CA 90007", lat=34.03079, lng=-118.28832,
         url="", amenities=["Furnished", "Private bathroom", "Laundry", "Bike storage"],
         plans=[p for p in FULL if p[0] != "entire" or p[1] in (3,)], desc="Co-living rooms and 3-bedroom units on a quiet residential block."),
    dict(key="palisades", name="The Palisades (sample)", address="W 29th St, Los Angeles, CA 90007", lat=34.02905, lng=-118.28650,
         url="", amenities=["Furnished", "Gym", "Parking", "In-unit laundry", "Pet friendly"],
         plans=[p for p in FULL if p[0] == "entire"], desc="Apartment building with studios through 3-bedroom units."),
    dict(key="citypark", name="City Park (sample)", address="1640 W 36th Pl, Los Angeles, CA 90018", lat=34.02180, lng=-118.30715,
         url="", amenities=["Parking", "Laundry", "Pet friendly"],
         plans=[("entire", 1, 1, None, 1750), ("entire", 2, 1, None, 2350), ("entire", 3, 2, None, 3200), ("private_room", 3, 2, False, 995)],
         desc="Lower-priced units west of Normandie, outside the DPS patrol zone."),
]


async def fetch(_client: PoliteClient) -> list[Listing]:
    out = []
    for b in BUILDINGS:
        units = [make_unit(rt, beds, baths, pb, rent=rent) for rt, beds, baths, pb, rent in b["plans"]]
        out.append(Listing(
            id=f"featured:{b['key']}", source="Featured (sample data)", url=b["url"], name=b["name"], address=b["address"],
            lat=b["lat"], lng=b["lng"], units=units, priceUnit="per unit / per person",
            amenities=b["amenities"], propertyTypes=["Apartments", "Student Housing"], description=b["desc"],
            availability="Fall 2027", sampleData=True,
        ).finalize())
    return out
