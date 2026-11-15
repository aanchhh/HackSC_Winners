"""Smart search: turn plain English into structured filters + a semantic remainder.

  "2b2b under $3k with in-unit laundry, 10 min walk to Viterbi, inside DPS"
    → beds=2 baths=2 maxRent=3000 amenities=[laundry] near=Viterbi(SAL) maxWalkMin=10 inDps=True

Rules handle the common phrasings with no API calls. If an LLM key is configured, the LLM also reads the
query (structured output) and fills anything the rules missed. Every understood constraint is returned as a
human-readable chip so the UI can show (and remove) it."""
import json
import math
import re
from dataclasses import asdict, dataclass, field, fields
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.listings.models import Listing, Unit

NUM_WORDS = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "single": 1, "double": 2}
AMENITIES = {
    "furnished": r"\bfurnish(?:ed)?\b",
    "laundry": r"\b(?:laundry|washer|dryer|w/d|in[- ]unit laundry)\b",
    "parking": r"\b(?:parking|garage|car space)\b",
    "pets": r"\b(?:pet[- ]friendly|pets? (?:allowed|ok)|pets?|dogs?|cats?)\b",
    "ac": r"\b(?:a/?c|air[- ]?con(?:ditioning)?)\b",
    "gym": r"\b(?:gym|fitness)\b",
    "pool": r"\bpool\b",
    "utilities included": r"\butilities included\b",
}
AMENITY_MATCH = {  # how each amenity is recognized in listing text
    "furnished": r"furnish|\bbed\b", "laundry": r"laundry|washer|dryer", "parking": r"parking|garage",
    "pets": r"pet", "ac": r"\bac\b|a/c|air con", "gym": r"gym|fitness", "pool": r"pool",
    "utilities included": r"utilities included",
}


@dataclass
class SmartQuery:
    text: str = ""                      # what's left for semantic/keyword ranking
    maxRent: int | None = None
    minRent: int | None = None
    beds: int | None = None             # exact bedrooms (0 = studio)
    minBeds: int | None = None
    baths: float | None = None
    roomType: str | None = None         # entire | private_room | shared_room
    privateBath: bool | None = None
    inDps: bool | None = None
    inFryft: bool | None = None
    amenities: list[str] = field(default_factory=list)
    nearBuildingId: int | None = None
    maxWalkMin: int | None = None
    source: str | None = None
    sort: str | None = None             # price | walk

    # ---- matching ----
    def unit_ok(self, u: Unit) -> bool:
        if self.roomType and u.roomType != self.roomType: return False
        # "2b2b" / "3 bed" without saying "room" means the whole unit, not a room inside a 3-bed house
        if not self.roomType and (self.beds is not None or self.minBeds is not None or self.baths is not None) and u.roomType != "entire":
            return False
        if self.beds is not None and u.beds != self.beds: return False
        if self.minBeds is not None and (u.beds or 0) < self.minBeds: return False
        if self.baths is not None and (u.baths is None or u.baths != self.baths): return False
        if self.privateBath is not None and u.privateBath is not self.privateBath: return False
        if self.maxRent is not None and (u.rent is None or u.rent > self.maxRent): return False
        if self.minRent is not None and (u.rent is None or u.rent < self.minRent): return False
        return True

    def has_unit_filters(self) -> bool:
        return any(v is not None for v in (self.roomType, self.beds, self.minBeds, self.baths, self.privateBath, self.maxRent, self.minRent))

    def match(self, l: Listing) -> list[Unit] | None:
        """Matching units (possibly empty list if no unit filters), or None if the listing is excluded."""
        if self.inDps is not None and l.inDps is not self.inDps: return None
        if self.inFryft is not None and l.inFryft is not self.inFryft: return None
        if self.source and self.source.lower() not in l.source.lower(): return None
        if self.amenities:
            blob = " ".join(l.amenities + [l.description, l.name]).lower()
            if not all(re.search(AMENITY_MATCH[a], blob) for a in self.amenities if a in AMENITY_MATCH): return None
        if self.nearBuildingId is not None and self.maxWalkMin is not None:
            if walk_minutes(l, self.nearBuildingId) > self.maxWalkMin: return None
        if not self.has_unit_filters():
            return []
        units = [u for u in l.units if self.unit_ok(u)]
        return units or None

    def chips(self) -> list[dict]:
        b = {x["id"]: x["name"] for x in buildings()}
        out = []
        add = lambda key, label: out.append({"key": key, "label": label})
        if self.maxRent is not None and self.minRent is not None: add("price", f"${self.minRent:,}–${self.maxRent:,}")
        elif self.maxRent is not None: add("maxRent", f"Under ${self.maxRent:,}")
        elif self.minRent is not None: add("minRent", f"Over ${self.minRent:,}")
        if self.beds == 0: add("beds", "Studio")
        elif self.beds is not None: add("beds", f"{self.beds} bed" + ("" if self.baths is not None else ""))
        if self.minBeds is not None: add("minBeds", f"{self.minBeds}+ beds")
        if self.baths is not None: add("baths", f"{self.baths:g} bath")
        if self.roomType: add("roomType", {"entire": "Entire unit", "private_room": "Private room", "shared_room": "Shared room"}[self.roomType])
        if self.privateBath is not None: add("privateBath", "Private bathroom" if self.privateBath else "Shared bathroom")
        if self.inDps: add("inDps", "Inside DPS zone")
        if self.inDps is False: add("inDps", "Outside DPS zone")
        if self.inFryft: add("inFryft", "Inside Fryft")
        for a in self.amenities: add(f"amenity:{a}", a.title() if a != "ac" else "A/C")
        if self.nearBuildingId is not None: add("near", f"≤{self.maxWalkMin} min walk to {b.get(self.nearBuildingId, 'campus')}")
        if self.sort == "price": add("sort", "Cheapest first")
        if self.sort == "walk": add("sort", "Closest first")
        if self.source: add("source", f"From {self.source}")
        return out

    def drop(self, keys: list[str]):
        for k in keys:
            if k == "price": self.maxRent = self.minRent = None
            elif k == "near": self.nearBuildingId = self.maxWalkMin = None
            elif k.startswith("amenity:"): self.amenities = [a for a in self.amenities if a != k.split(":", 1)[1]]
            elif k in {f.name for f in fields(self)}: setattr(self, k, [] if k == "amenities" else None)

    def as_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v not in (None, [], "")}


# ---------- buildings / walking ----------
@lru_cache
def buildings() -> list[dict]:
    return json.loads((Path(settings.data_dir) / "buildings.json").read_text())


BUILDING_ALIASES = {
    1: ["viterbi", "sal", "engineering", "salvatori"], 2: ["rth", "ronald tutor hall"], 3: ["marshall", "jkp", "business school"],
    4: ["leavey"], 5: ["doheny"], 6: ["vkc", "von kleinsmid"], 7: ["annenberg", "ann "], 8: ["lyon", "gym on campus"],
    9: ["tommy trojan", "tommy", "campus", "usc"], 10: ["usc village", "village"],
}


def walk_minutes(l: Listing, building_id: int) -> float:
    b = next((x for x in buildings() if x["id"] == building_id), None)
    if not b: return 0
    la1, lo1, la2, lo2 = map(math.radians, (l.lat, l.lng, b["lat"], b["lng"]))
    m = 6371000 * 2 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
    return m * 1.3 / 80  # 1.3 street-grid detour factor, 80 m/min walking


# ---------- rule-based parser ----------
def _money(s: str) -> int:
    s = s.lower().replace(",", "").replace("$", "").strip()
    return int(float(s[:-1]) * 1000) if s.endswith("k") else int(float(s))


MONEY = r"\$?\s*(\d+(?:[.,]\d+)?\s*k?)"


def parse_rules(q: str) -> SmartQuery:
    t = " " + q.lower() + " "
    for w, n in NUM_WORDS.items():
        t = re.sub(rf"\b{w}(?=[\s-]*(?:bed|br|bd|bath|ba|bedroom|bathroom))", str(n), t)
    sq = SmartQuery()
    spans: list[tuple[int, int]] = []
    def take(m):
        spans.append(m.span()); return m

    # price
    if m := re.search(rf"(?:between|from)\s+{MONEY}\s*(?:and|to|-)\s*{MONEY}", t) or re.search(rf"{MONEY}\s*(?:-|–|to)\s*{MONEY}\b(?!\s*(?:min|bed|bath|br|ba))", t):
        take(m); sq.minRent, sq.maxRent = _money(m.group(1)), _money(m.group(2))
    elif m := re.search(rf"(?:under|below|less than|cheaper than|max(?:imum)?|up to|at most|<=?|budget(?: of)?)\s*{MONEY}", t):
        take(m); sq.maxRent = _money(m.group(1))
    elif m := re.search(rf"(?:over|above|more than|at least|min(?:imum)?|>=?)\s*{MONEY}", t):
        take(m); sq.minRent = _money(m.group(1))
    elif m := re.search(rf"(?:around|about|~)\s*{MONEY}", t):
        take(m); v = _money(m.group(1)); sq.minRent, sq.maxRent = int(v * 0.85), int(v * 1.15)
    if m := re.search(r"\b(?:cheapest|cheap|affordable|lowest price|least expensive)\b", t):
        take(m); sq.sort = "price"

    # bed/bath combos: 2b2b, 2b/1b, 2bd 2ba, 3 bed 2 bath, 2br/2ba, 2x2
    if m := re.search(r"\b(\d)\s*(?:b|bd|br|bed(?:room)?s?)\s*[/,&+ -]*\s*(\d(?:\.5)?)\s*(?:b|ba|bth|bath(?:room)?s?)\b", t) or re.search(r"\b(\d)\s*x\s*(\d(?:\.5)?)\b", t):
        take(m); sq.beds, sq.baths = int(m.group(1)), float(m.group(2))
    else:
        if m := re.search(r"\b(\d)\s*\+\s*(?:b|bd|br|bed(?:room)?s?)\b", t) or re.search(r"\bat least\s*(\d)\s*(?:bd|br|bed(?:room)?s?)\b", t):
            take(m); sq.minBeds = int(m.group(1))
        elif m := re.search(r"\b(\d)\s*[- ]?(?:bd|br|bed(?:room)?s?)\b", t):
            take(m); sq.beds = int(m.group(1))
        if m := re.search(r"\b(\d(?:\.5)?)\s*[- ]?(?:ba|bath(?:room)?s?)\b", t):
            take(m); sq.baths = float(m.group(1))
    if m := re.search(r"\bstudios?\b", t):
        take(m); sq.beds, sq.roomType = 0, "entire"

    # room type + bathroom
    if m := re.search(r"\b(?:shared room|share a room|roommate in (?:the )?same room|double room|split room)\b", t):
        take(m); sq.roomType = "shared_room"
    elif m := re.search(r"\b(?:private room|own room|single room|room in (?:a )?(?:house|apartment|shared)|co-?living|a room)\b", t):
        take(m); sq.roomType = "private_room"
    elif m := re.search(r"\b(?:entire|whole|full)\s+(?:unit|apartment|apt|place|house)|\bmy own (?:place|apartment)\b", t):
        take(m); sq.roomType = "entire"
    if m := re.search(r"\b(?:private|own|ensuite|en-suite)\s+(?:bath(?:room)?|toilet)\b|\bensuite\b", t):
        take(m); sq.privateBath = True
    elif m := re.search(r"\bshared\s+bath(?:room)?\b", t):
        take(m); sq.privateBath = False

    # zones
    if m := re.search(r"\b(?:inside|in|within)\s+(?:the\s+)?dps\b|\bdps[- ]patrolled\b|\bpatrolled\b|\bsafe(?:st)?\s+(?:area|block|neighbou?rhood|zone)\b", t):
        take(m); sq.inDps = True
    elif m := re.search(r"\boutside\s+(?:the\s+)?dps\b", t):
        take(m); sq.inDps = False
    if m := re.search(r"\b(?:inside|in|within)\s+(?:the\s+)?(?:fryft|free lyft)\b|\b(?:fryft|free lyft)(?: zone| area)?\b", t):
        take(m); sq.inFryft = True

    # amenities
    for name, pat in AMENITIES.items():
        if m := re.search(pat, t):
            take(m); sq.amenities.append(name)

    # near a building / walk time
    walk = re.search(r"(\d+)\s*(?:-|\s)?min(?:ute)?s?(?:\s+walk(?:ing)?)?\s*(?:to|from|of)\s+", t)
    for bid, names in BUILDING_ALIASES.items():
        for n in names:
            if (m := re.search(rf"\b{re.escape(n.strip())}\b", t)) and not (n.strip() == "usc" and "usc village" in t):
                sq.nearBuildingId = bid
                sq.maxWalkMin = int(walk.group(1)) if walk else 15
                take(m)
                if walk: take(walk)
                break
        if sq.nearBuildingId is not None:
            break
    if m := re.search(r"\b(?:closest|nearest|shortest walk)\b", t):
        take(m); sq.sort = "walk"
        if sq.nearBuildingId is None: sq.nearBuildingId, sq.maxWalkMin = 9, 60

    # remainder → semantic text (drop filler)
    keep = list(t)
    for a, b in spans:
        for i in range(a, b): keep[i] = " "
    rest = re.sub(r"\b(?:i want|looking for|show me|find|need|with|and|a|an|the|near|close to|to|in|for|me|please|apartments?|place|housing|listings?|walk|walking)\b", " ", "".join(keep))
    sq.text = re.sub(r"[^\w\s'-]", " ", rest)
    sq.text = re.sub(r"\s+", " ", sq.text).strip()
    return sq


# ---------- optional LLM parser ----------
async def parse(q: str) -> tuple[SmartQuery, str]:
    """Returns (query, parser) where parser is 'rules' or 'rules+llm'."""
    sq = parse_rules(q)
    try:
        from app.llm import get_llm
        llm = get_llm()
    except Exception:
        llm = None
    if not llm or not q.strip():
        return sq, "rules"
    try:
        from pydantic import BaseModel

        class LLMQuery(BaseModel):
            maxRent: int | None = None
            minRent: int | None = None
            beds: int | None = None
            baths: float | None = None
            roomType: str | None = None   # entire | private_room | shared_room
            privateBath: bool | None = None
            inDps: bool | None = None
            amenities: list[str] = []
            nearBuilding: str | None = None
            maxWalkMin: int | None = None

        got = await llm.with_structured_output(LLMQuery).ainvoke(
            "Extract USC housing search constraints. Only set what the user stated. roomType is one of entire, private_room, "
            f"shared_room. Amenities from: {list(AMENITIES)}. Query: {q}")
        for k in ("maxRent", "minRent", "beds", "baths", "roomType", "privateBath", "inDps", "maxWalkMin"):
            if getattr(sq, k) in (None, []) and getattr(got, k) is not None:
                setattr(sq, k, getattr(got, k))
        sq.amenities = sorted(set(sq.amenities) | {a for a in got.amenities if a in AMENITIES})
        if sq.nearBuildingId is None and got.nearBuilding:
            for bid, names in BUILDING_ALIASES.items():
                if any(n.strip() in got.nearBuilding.lower() for n in names):
                    sq.nearBuildingId, sq.maxWalkMin = bid, sq.maxWalkMin or 15
                    break
        return sq, "rules+llm"
    except Exception:
        return sq, "rules"
