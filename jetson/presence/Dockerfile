FROM python:3.11-slim-bookworm

# iproute2: `ip neigh` / `ip addr` for the ARP-based Wi-Fi probe.
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY core.py probes.py app.py datasync.py data_manager_client.py ./

ENV PYTHONUNBUFFERED=1 DATA_DIR=/data PORT=8090
EXPOSE 8090
CMD ["python3", "app.py"]
