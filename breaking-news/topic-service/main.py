"""
Topic Service - BERTopic-based topic modeling microservice.
Runs as a separate Railway service for clustering and classifying news articles.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from bertopic import BERTopic
from sklearn.feature_extraction.text import CountVectorizer
import numpy as np

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class FitRequest(BaseModel):
    documents: list[str]
    ids: list[str]


class PredictRequest(BaseModel):
    documents: list[str]
    ids: list[str]


class TopicKeyword(BaseModel):
    word: str
    score: float


class TopicInfo(BaseModel):
    id: int
    label: str
    count: int
    keywords: list[TopicKeyword]


class Assignment(BaseModel):
    doc_id: str
    topic_id: int
    confidence: float = 0.0


class FitResponse(BaseModel):
    topics: list[TopicInfo]
    assignments: list[Assignment]


class PredictResponse(BaseModel):
    assignments: list[Assignment]


class TopicsListResponse(BaseModel):
    topics: list[TopicInfo]


class HealthResponse(BaseModel):
    status: str
    model_fitted: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

topic_model: BERTopic | None = None
is_fitted: bool = False


def _extract_topic_info(model: BERTopic) -> list[TopicInfo]:
    """Build a list of TopicInfo from the current BERTopic model."""
    info = model.get_topic_info()
    topics: list[TopicInfo] = []

    for _, row in info.iterrows():
        topic_id = int(row["Topic"])
        if topic_id == -1:
            # Skip the outlier topic
            continue

        topic_words = model.get_topic(topic_id)
        if not topic_words:
            continue

        keywords = [
            TopicKeyword(word=w, score=round(float(s), 4))
            for w, s in topic_words
        ]
        label = " ".join(kw.word for kw in keywords[:4])
        count = int(row["Count"])

        topics.append(
            TopicInfo(id=topic_id, label=label, count=count, keywords=keywords)
        )

    return topics


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global topic_model, is_fitted
    topic_model = BERTopic(
        language="english",
        min_topic_size=3,
        vectorizer_model=CountVectorizer(stop_words="english"),
        verbose=False,
    )
    is_fitted = False
    yield


app = FastAPI(
    title="Topic Service",
    description="BERTopic-based topic modeling microservice",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/topics/fit", response_model=FitResponse)
async def fit_topics(request: FitRequest):
    """Train / update the topic model on a batch of documents."""
    global topic_model, is_fitted

    if topic_model is None:
        raise HTTPException(status_code=503, detail="Model not initialised")

    if len(request.documents) != len(request.ids):
        raise HTTPException(
            status_code=400,
            detail="documents and ids must have the same length",
        )

    if len(request.documents) < 3:
        raise HTTPException(
            status_code=400,
            detail="At least 3 documents are required to fit the model",
        )

    topics_out, probs = topic_model.fit_transform(request.documents)
    is_fitted = True

    topic_info = _extract_topic_info(topic_model)

    # Build per-document assignments
    assignments: list[Assignment] = []
    for doc_id, topic_id, prob_row in zip(
        request.ids, topics_out, probs if probs is not None else [None] * len(topics_out)
    ):
        if prob_row is not None:
            confidence = round(float(np.max(prob_row)) if hasattr(prob_row, "__len__") else float(prob_row), 4)
        else:
            confidence = 0.0
        assignments.append(
            Assignment(doc_id=doc_id, topic_id=int(topic_id), confidence=confidence)
        )

    return FitResponse(topics=topic_info, assignments=assignments)


@app.post("/topics/predict", response_model=PredictResponse)
async def predict_topics(request: PredictRequest):
    """Assign topics to new documents using the fitted model."""
    global topic_model, is_fitted

    if topic_model is None or not is_fitted:
        raise HTTPException(
            status_code=400,
            detail="Model has not been fitted yet. Call /topics/fit first.",
        )

    if len(request.documents) != len(request.ids):
        raise HTTPException(
            status_code=400,
            detail="documents and ids must have the same length",
        )

    topics_out, probs = topic_model.transform(request.documents)

    assignments: list[Assignment] = []
    for doc_id, topic_id, prob_row in zip(
        request.ids, topics_out, probs if probs is not None else [None] * len(topics_out)
    ):
        if prob_row is not None:
            confidence = round(float(np.max(prob_row)) if hasattr(prob_row, "__len__") else float(prob_row), 4)
        else:
            confidence = 0.0
        assignments.append(
            Assignment(doc_id=doc_id, topic_id=int(topic_id), confidence=confidence)
        )

    return PredictResponse(assignments=assignments)


@app.get("/topics", response_model=TopicsListResponse)
async def list_topics():
    """List all discovered topics."""
    global topic_model, is_fitted

    if topic_model is None or not is_fitted:
        return TopicsListResponse(topics=[])

    return TopicsListResponse(topics=_extract_topic_info(topic_model))


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        model_fitted=is_fitted,
    )
