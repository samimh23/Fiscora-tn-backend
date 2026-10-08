FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/work/model-cache
ENV LD_LIBRARY_PATH=/usr/local/nvidia/lib64:/usr/local/nvidia/lib \
    PATH=/usr/local/nvidia/bin:${PATH} \
    NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt cloud-requirements.txt ./
RUN python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128 \
    && python -m pip install -r requirements.txt -r cloud-requirements.txt \
    && python -m pip check
COPY data.py train.py cloud_io.py cloud_entry.py gpu_check.py ./
RUN python /app/train.py --help && python /app/cloud_entry.py --help
ENTRYPOINT ["python", "/app/cloud_entry.py"]
