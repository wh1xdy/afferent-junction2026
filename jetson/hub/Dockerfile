# The hub alone: Python's standard library + zeroconf (finds the UNO Q on the mesh).
# No language model is in the image and none is started.
FROM python:3.12-slim
RUN pip install --no-cache-dir zeroconf==0.154.0
WORKDIR /hub
COPY app.py auth.py store.py report.py grounding.py demo.py fhir.py network.py ./
ENV PYTHONUNBUFFERED=1 AFFERENT_DB=/data/afferent.db PORT=8090
ENTRYPOINT ["python3", "-u", "/hub/app.py"]
