#!/bin/sh
# local LLM on 127.0.0.1:8081 (4 of 6 CPU cores), then the hub.
# llama-server loads its libllama-*-impl.so from /app, so run it from there.
cd /app && LD_LIBRARY_PATH=/app ./llama-server -m /models/model.gguf --host 127.0.0.1 --port 8081 -c 4096 -t 4 &
cd /hub && exec python3 -u /hub/app.py
