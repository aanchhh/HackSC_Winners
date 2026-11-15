# TrojanScout AI service on a Hugging Face Space (Docker, free CPU tier: 2 vCPU / 16 GB RAM).
# The GitHub Action in .github/workflows/deploy-ai-service.yml copies ai-service/ and data/ next to this file.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/app/.cache/hf
WORKDIR /app
COPY ai-service/requirements.txt ai-service/requirements.txt
# CPU-only PyTorch keeps the image small (no CUDA)
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch && pip install -r ai-service/requirements.txt
COPY ai-service ai-service
COPY data data
# Spaces run as uid 1000: the index, model cache and data must be writable
RUN mkdir -p /app/.cache/hf ai-service/.index && chown -R 1000:1000 /app
USER 1000
WORKDIR /app/ai-service
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
