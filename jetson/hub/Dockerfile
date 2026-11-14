# llama.cpp server (multi-arch, CPU) + the hub in one container: the LLM listens on localhost only.
FROM ghcr.io/ggml-org/llama.cpp@sha256:c7d58273d753d33a352e5c41ab300c5ae040a16fa4b202231bb606478065c124
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages zeroconf==0.154.0 \
 && rm -rf /var/lib/apt/lists/*
# Qwen2.5-3B-Instruct, 4-bit (2.1 GB), baked in: the Jetson app has no internet on the mesh
ADD https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf /models/model.gguf
WORKDIR /hub
COPY app.py store.py report.py grounding.py demo.py fhir.py network.py start.sh ./
ENV PYTHONUNBUFFERED=1 AFFERENT_DB=/data/afferent.db PORT=8090
ENTRYPOINT ["/bin/sh", "/hub/start.sh"]
