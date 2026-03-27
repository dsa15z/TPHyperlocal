## Stage 1: Install dependencies and download model
FROM python:3.11-slim AS builder
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Pre-download the default sentence-transformers model so it is baked into the
# image and does not need to be fetched at runtime.
RUN pip install --no-cache-dir sentence-transformers==3.0.1 && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

## Stage 2: Runtime image
FROM python:3.11-slim
WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy cached sentence-transformers model from builder
COPY --from=builder /root/.cache /root/.cache

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
