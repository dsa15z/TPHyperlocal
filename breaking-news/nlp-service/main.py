"""
NLP Service - Named Entity Recognition and Sentiment Analysis
Runs as a separate Railway microservice using spaCy.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import spacy

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class NERRequest(BaseModel):
    text: str
    language: str = "en"


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int


class NERResponse(BaseModel):
    entities: dict[str, list[Entity]]
    model: str


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    score: float
    label: str
    confidence: float


class HealthResponse(BaseModel):
    status: str
    model: str


# ---------------------------------------------------------------------------
# Sentiment word lists (simple lexicon-based approach)
# ---------------------------------------------------------------------------

POSITIVE_WORDS = {
    "good", "great", "excellent", "amazing", "wonderful", "fantastic",
    "positive", "happy", "love", "best", "better", "beautiful", "nice",
    "awesome", "outstanding", "brilliant", "superb", "pleased", "joy",
    "success", "successful", "win", "winning", "hope", "hopeful",
    "improve", "improved", "improvement", "benefit", "beneficial",
    "celebrate", "celebration", "proud", "exciting", "excited",
    "remarkable", "impressive", "perfect", "thriving", "safe", "saved",
    "hero", "heroic", "rescue", "recovered", "growth", "gains",
}

NEGATIVE_WORDS = {
    "bad", "terrible", "horrible", "awful", "worst", "worse", "poor",
    "negative", "sad", "hate", "ugly", "disgusting", "failure", "fail",
    "tragic", "tragedy", "death", "dead", "killed", "murder", "crime",
    "attack", "crash", "disaster", "catastrophe", "crisis", "threat",
    "dangerous", "violence", "violent", "war", "conflict", "shooting",
    "fire", "flood", "storm", "damage", "destroyed", "injury", "injured",
    "victim", "victims", "suspect", "arrested", "charged", "fraud",
    "corruption", "scandal", "protest", "riot", "fear", "panic",
}

# ---------------------------------------------------------------------------
# spaCy label mapping
# ---------------------------------------------------------------------------

LABEL_MAP = {
    "PERSON": "people",
    "ORG": "organizations",
    "GPE": "locations",
    "LOC": "locations",
    "FAC": "locations",
    "EVENT": "events",
    "DATE": "dates",
    "TIME": "dates",
}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

nlp_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nlp_model
    nlp_model = spacy.load("en_core_web_sm")
    yield


app = FastAPI(
    title="NLP Service",
    description="Named Entity Recognition and Sentiment Analysis microservice",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/ner", response_model=NERResponse)
async def extract_entities(request: NERRequest):
    """Run Named Entity Recognition on the provided text."""
    if nlp_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    doc = nlp_model(request.text)

    entities: dict[str, list[Entity]] = {
        "people": [],
        "organizations": [],
        "locations": [],
        "events": [],
        "dates": [],
    }

    seen: set[tuple[str, str, int, int]] = set()

    for ent in doc.ents:
        category = LABEL_MAP.get(ent.label_)
        if category is None:
            continue

        key = (ent.text, ent.label_, ent.start_char, ent.end_char)
        if key in seen:
            continue
        seen.add(key)

        entities[category].append(
            Entity(
                text=ent.text,
                label=ent.label_,
                start=ent.start_char,
                end=ent.end_char,
            )
        )

    return NERResponse(entities=entities, model="en_core_web_sm")


@app.post("/sentiment", response_model=SentimentResponse)
async def analyze_sentiment(request: SentimentRequest):
    """Analyze sentiment of the provided text using a lexicon-based approach."""
    text_lower = request.text.lower()
    words = set(text_lower.split())

    pos_count = len(words & POSITIVE_WORDS)
    neg_count = len(words & NEGATIVE_WORDS)
    total = pos_count + neg_count

    if total == 0:
        return SentimentResponse(score=0.0, label="NEUTRAL", confidence=0.5)

    # Score ranges from -1 (fully negative) to +1 (fully positive)
    raw_score = (pos_count - neg_count) / total
    # Normalise to 0..1 for the response
    score = round((raw_score + 1) / 2, 4)

    if raw_score > 0.05:
        label = "POSITIVE"
    elif raw_score < -0.05:
        label = "NEGATIVE"
    else:
        label = "NEUTRAL"

    # Confidence increases with more signal words
    confidence = round(min(total / 10, 1.0), 4)

    return SentimentResponse(score=score, label=label, confidence=confidence)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    if nlp_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return HealthResponse(status="healthy", model="en_core_web_sm")
