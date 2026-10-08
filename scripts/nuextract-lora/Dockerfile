FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/work/model-cache
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt cloud-requirements.txt ./
RUN python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128 \
    && python -m pip install -r requirements.txt -r cloud-requirements.txt \
    && python -m pip check
COPY data.py train.py cloud_io.py cloud_entry.py ./
ENTRYPOINT ["python", "/app/cloud_entry.py"]
