"""Hybrid retriever over listings — all free, all local.

  query ─┬─ metadata pre-filter (rent, beds, DPS/Fryft, source) ── hard constraints are filters, not "similarity"
         ├─ dense:  bge-small-en-v1.5 → FAISS IndexFlatIP (exact cosine; N is small, so exact beats ANN)
         ├─ sparse: BM25 via bm25s (+ Snowball stemming) ── exact terms: street names, "Figueroa", "furnished"
         └─ Reciprocal Rank Fusion (k=60) → cross-encoder rerank of the top 20 → results
"""
import json
import re
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import bm25s
import faiss
import numpy as np
import Stemmer

from app.config import settings
from app.listings.models import Listing, doc_text

EMBED_MODEL = "BAAI/bge-small-en-v1.5"
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
RRF_K = 60
CANDIDATES = 50
RERANK_TOP = 20

_stemmer = Stemmer.Stemmer("english")


@lru_cache
def _embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL)


@lru_cache
def _reranker():
    from sentence_transformers import CrossEncoder
    return CrossEncoder(settings.reranker_model)


def _embed(texts: list[str], query: bool = False) -> np.ndarray:
    if query:
        texts = [BGE_QUERY_PREFIX + t for t in texts]
    return np.asarray(_embedder().encode(texts, normalize_embeddings=True, batch_size=32), dtype="float32")


@dataclass
class Filters:
    maxRent: int | None = None
    minRent: int | None = None
    minBeds: int | None = None
    maxBeds: int | None = None
    inDps: bool | None = None
    inFryft: bool | None = None
    source: str | None = None

    def ok(self, l: Listing) -> bool:
        if self.maxRent is not None and (l.rent is None or l.rent > self.maxRent): return False
        if self.minRent is not None and (l.rent is None or l.rent < self.minRent): return False
        if self.minBeds is not None and ((l.bedsMax if l.bedsMax is not None else l.beds) or 0) < self.minBeds: return False
        if self.maxBeds is not None and (l.beds or 0) > self.maxBeds: return False
        if self.inDps is not None and l.inDps is not self.inDps: return False
        if self.inFryft is not None and l.inFryft is not self.inFryft: return False
        if self.source and l.source.lower() != self.source.lower(): return False
        return True


def parse_query(q: str) -> tuple[str, Filters]:
    """Pull hard constraints out of free text ("under $1,400 2 bed inside DPS") so they filter instead of fuzzily matching."""
    f, t = Filters(), q.lower()
    if m := re.search(r"(?:under|below|less than|max|<|up to)\s*\$?\s*([\d,]{3,6})", t):
        f.maxRent = int(m.group(1).replace(",", ""))
    if m := re.search(r"(\d+)\s*(?:\+\s*)?(?:bed|br|bd|bedroom)", t):
        f.minBeds = int(m.group(1))
    if "studio" in t:
        f.minBeds, f.maxBeds = None, 0
    if re.search(r"\b(?:inside|in|within)\s+(?:the\s+)?dps\b", t):
        f.inDps = True
    if re.search(r"\b(?:inside|in|within)\s+(?:the\s+)?(?:fryft|free lyft)\b", t):
        f.inFryft = True
    return q, f


class HybridIndex:
    def __init__(self, directory: Path):
        self.dir = directory
        self.listings: list[Listing] = []
        self.faiss: faiss.Index | None = None
        self.bm25: bm25s.BM25 | None = None
        self.built_at: str | None = None
        self._lock = threading.RLock()

    # ---------- build / persist ----------
    def build(self, listings: list[Listing]):
        texts = [doc_text(l) for l in listings]
        vecs = _embed(texts) if texts else np.zeros((0, 384), dtype="float32")
        fi = faiss.IndexFlatIP(vecs.shape[1])
        fi.add(vecs)
        bm = bm25s.BM25()
        if texts:
            bm.index(bm25s.tokenize(texts, stopwords="en", stemmer=_stemmer, show_progress=False), show_progress=False)
        with self._lock:
            self.listings, self.faiss, self.bm25 = listings, fi, bm
            self.built_at = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.save()

    def save(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        with self._lock:
            faiss.write_index(self.faiss, str(self.dir / "listings.faiss"))
            if self.listings:
                self.bm25.save(str(self.dir / "bm25"))
            (self.dir / "meta.json").write_text(json.dumps(
                {"builtAt": self.built_at, "listings": [l.model_dump() for l in self.listings]}))

    def load(self) -> bool:
        meta = self.dir / "meta.json"
        if not meta.exists():
            return False
        m = json.loads(meta.read_text())
        with self._lock:
            self.listings = [Listing(**x) for x in m["listings"]]
            self.faiss = faiss.read_index(str(self.dir / "listings.faiss"))
            self.bm25 = bm25s.BM25.load(str(self.dir / "bm25")) if self.listings else bm25s.BM25()
            self.built_at = m["builtAt"]
        return True

    # ---------- search ----------
    def search(self, query: str, filters: Filters | None = None, k: int = 10, rerank: bool = True) -> list[dict]:
        filters = filters or Filters()
        with self._lock:
            listings, fi, bm = self.listings, self.faiss, self.bm25
        allowed = np.array([i for i, l in enumerate(listings) if filters.ok(l)], dtype="int64")
        if not len(allowed):
            return []
        query = query.strip()
        if not query:  # browse mode: just the filter, cheapest first
            idx = sorted(allowed.tolist(), key=lambda i: (listings[i].rent is None, listings[i].rent or 0))
            return [{"listing": listings[i], "score": None, "denseRank": None, "bm25Rank": None} for i in idx[:k]]

        n = min(CANDIDATES, len(allowed))
        # Dense: FAISS restricted to the pre-filtered ids
        params = faiss.SearchParameters(sel=faiss.IDSelectorBatch(allowed))
        _, d_ids = fi.search(_embed([query], query=True), n, params=params)
        dense = [int(i) for i in d_ids[0] if i >= 0]
        # Sparse: BM25 over everything, then keep allowed ids
        q_tokens = bm25s.tokenize([query], stopwords="en", stemmer=_stemmer, show_progress=False)
        allowed_set = set(allowed.tolist())
        sparse: list[int] = []
        if q_tokens.vocab:
            b_ids, b_scores = bm.retrieve(q_tokens, k=len(listings), show_progress=False)
            sparse = [int(i) for i, s in zip(b_ids[0], b_scores[0]) if s > 0 and int(i) in allowed_set][:n]

        # Reciprocal Rank Fusion
        fused: dict[int, float] = {}
        for ranks in (dense, sparse):
            for r, i in enumerate(ranks):
                fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + r + 1)
        order = sorted(fused, key=fused.get, reverse=True)
        d_rank = {i: r + 1 for r, i in enumerate(dense)}
        s_rank = {i: r + 1 for r, i in enumerate(sparse)}

        scores = {i: fused[i] for i in order}
        if rerank and settings.reranker_model and len(order) > 1:
            top = order[:RERANK_TOP]
            ce = _reranker().predict([(query, doc_text(listings[i])) for i in top], show_progress_bar=False)
            top = [i for _, i in sorted(zip(ce, top), key=lambda x: -x[0])]
            scores.update({i: float(s) for i, s in zip(top, sorted(ce, reverse=True))})
            order = top + order[RERANK_TOP:]

        return [{"listing": listings[i], "score": round(scores[i], 4), "denseRank": d_rank.get(i), "bm25Rank": s_rank.get(i)}
                for i in order[:k]]


INDEX = HybridIndex(Path(settings.index_dir))


def warm():
    """Load models once at startup so the first real query isn't a 10 s cold start."""
    _embed(["warm up"], query=True)
    if settings.reranker_model:
        _reranker().predict([("warm", "up")], show_progress_bar=False)
