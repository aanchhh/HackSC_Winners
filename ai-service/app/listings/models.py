"""Normalized listing record. camelCase on purpose: written to data/listings.json and read by Node + React."""
from pydantic import BaseModel, Field


class Listing(BaseModel):
    id: str                                  # "<source>:<native id>" — stable across refreshes
    source: str
    url: str
    name: str
    address: str
    lat: float
    lng: float
    rent: int | None = None                  # lowest advertised price
    rentMax: int | None = None
    priceUnit: str = "per unit"              # "per unit" | "per room"
    callForPricing: bool = False
    beds: int | None = None
    bedsMax: int | None = None
    baths: float | None = None
    availability: str | None = None
    propertyTypes: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)
    description: str = ""
    utilitiesEst: int = 90                   # estimate, shown as such in the UI
    distanceToCampusMi: float | None = None
    inDps: bool | None = None                # filled from Node /internal/zone-check
    inFryft: bool | None = None
    scrapedAt: str = ""


def doc_text(l: Listing) -> str:
    """Text indexed by both BM25 and the dense retriever."""
    beds = "studio" if l.beds == 0 else f"{l.beds}" + (f"-{l.bedsMax}" if l.bedsMax and l.bedsMax != l.beds else "") + " bedroom"
    price = "call for pricing" if l.rent is None else f"${l.rent}" + (f"-${l.rentMax}" if l.rentMax and l.rentMax != l.rent else "") + f" {l.priceUnit}"
    zones = []
    if l.inDps: zones.append("inside DPS patrol zone")
    if l.inDps is False: zones.append("outside DPS patrol zone")
    if l.inFryft: zones.append("inside Fryft free Lyft zone")
    parts = [l.name, l.address, beds, price, ", ".join(l.propertyTypes), ", ".join(l.amenities),
             l.availability or "", ", ".join(zones),
             f"{l.distanceToCampusMi:.1f} miles from USC" if l.distanceToCampusMi is not None else "", l.description]
    return ". ".join(p for p in parts if p)
