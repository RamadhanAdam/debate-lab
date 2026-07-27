FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_DATA_DIR=/data

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/input /data/debates /data/support && \
    useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /data

USER appuser

EXPOSE 7860
CMD ["uvicorn", "web_app:app", "--host", "0.0.0.0", "--port", "7860"]
